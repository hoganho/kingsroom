// src/utils/batchTournamentScanner.ts
// Script to perform initial scan of 1000+ tournaments without Lambda timeouts

import { generateClient } from 'aws-amplify/api';
import type { ScraperJob } from '../API';

const client = generateClient();

interface BatchScanConfig {
    startId: number;
    endId: number;
    batchSize: number;
    delayBetweenBatches: number; // milliseconds
    maxGamesPerBatch: number;
}

interface BatchResult {
    batchNumber: number;
    startId: number;
    endId: number;
    job?: ScraperJob;
    error?: string;
    stats: {
        newGamesScraped: number;
        gamesUpdated: number;
        errors: number;
        blanks: number;
    };
}

export class BatchTournamentScanner {
    private config: BatchScanConfig;
    private results: BatchResult[] = [];
    private isRunning = false;
    private currentBatch = 0;
    private onProgressCallback?: (progress: any) => void;

    constructor(config: Partial<BatchScanConfig> = {}) {
        this.config = {
            startId: config.startId || 1,
            endId: config.endId || 1000,
            batchSize: config.batchSize || 50, // Process 50 IDs at a time
            delayBetweenBatches: config.delayBetweenBatches || 5000, // 5 second delay
            maxGamesPerBatch: config.maxGamesPerBatch || 100 // High limit to scan full range
        };
    }

    /**
     * Set progress callback
     */
    onProgress(callback: (progress: any) => void) {
        this.onProgressCallback = callback;
    }

    /**
     * Start the batch scanning process
     */
    async startBatchScan(): Promise<BatchResult[]> {
        if (this.isRunning) {
            throw new Error('Batch scan already in progress');
        }

        this.isRunning = true;
        this.results = [];
        this.currentBatch = 0;

        const totalBatches = Math.ceil(
            (this.config.endId - this.config.startId + 1) / this.config.batchSize
        );

        console.log(`Starting batch scan: ${totalBatches} batches to process`);
        console.log(`Range: ID ${this.config.startId} to ${this.config.endId}`);

        try {
            let currentStartId = this.config.startId;

            while (currentStartId <= this.config.endId && this.isRunning) {
                const batchEndId = Math.min(
                    currentStartId + this.config.batchSize - 1,
                    this.config.endId
                );

                this.currentBatch++;

                // Report progress
                this.reportProgress({
                    currentBatch: this.currentBatch,
                    totalBatches,
                    currentStartId,
                    batchEndId,
                    percentComplete: Math.round((this.currentBatch / totalBatches) * 100)
                });

                // Execute batch
                const batchResult = await this.executeBatch(
                    this.currentBatch,
                    currentStartId,
                    batchEndId
                );

                this.results.push(batchResult);

                // Check if we should stop (e.g., too many consecutive errors)
                if (this.shouldStopScanning(batchResult)) {
                    console.log('Stopping scan due to consecutive failures');
                    break;
                }

                // Move to next batch
                currentStartId = batchEndId + 1;

                // Delay between batches (except for last batch)
                if (currentStartId <= this.config.endId && this.config.delayBetweenBatches > 0) {
                    console.log(`Waiting ${this.config.delayBetweenBatches}ms before next batch...`);
                    await this.delay(this.config.delayBetweenBatches);
                }
            }

            // Final summary
            this.reportSummary();

            return this.results;

        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Execute a single batch
     */
    private async executeBatch(
        batchNumber: number,
        startId: number,
        endId: number
    ): Promise<BatchResult> {
        console.log(`\nExecuting Batch ${batchNumber}: IDs ${startId} to ${endId}`);

        const result: BatchResult = {
            batchNumber,
            startId,
            endId,
            stats: {
                newGamesScraped: 0,
                gamesUpdated: 0,
                errors: 0,
                blanks: 0
            }
        };

        try {
            // Start scraper job with specific ID range
            const response = await client.graphql({
                query: /* GraphQL */ `
                    mutation StartScraperJob($input: StartScraperJobInput!) {
                        startScraperJob(input: $input) {
                            id
                            jobId
                            status
                            triggerSource
                            startTime
                            maxGames
                            startId
                            endId
                            totalURLsProcessed
                            newGamesScraped
                            gamesUpdated
                            gamesSkipped
                            errors
                            blanks
                            createdAt
                            updatedAt
                        }
                    }
                `,
                variables: {
                    input: {
                        triggerSource: 'MANUAL',
                        triggeredBy: 'batch-scanner',
                        maxGames: this.config.maxGamesPerBatch,
                        startId,
                        endId,
                        isFullScan: true
                    }
                }
            });

            // Type guard for GraphQL response
            if ('data' in response && response.data) {
                const job = response.data.startScraperJob;
                result.job = job;

                // Wait for job to complete (poll status)
                const completedJob = await this.waitForJobCompletion(job.id);
                
                if (completedJob) {
                    result.stats = {
                        newGamesScraped: completedJob.newGamesScraped || 0,
                        gamesUpdated: completedJob.gamesUpdated || 0,
                        errors: completedJob.errors || 0,
                        blanks: completedJob.blanks || 0
                    };

                    console.log(`Batch ${batchNumber} completed:`, result.stats);
                }
            }

        } catch (error) {
            console.error(`Batch ${batchNumber} failed:`, error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            result.error = errorMessage;
        }

        return result;
    }

    /**
     * Poll job status until completion
     */
    private async waitForJobCompletion(
        jobId: string,
        maxWaitTime: number = 240000, // 4 minutes max
        pollInterval: number = 3000 // Check every 3 seconds
    ): Promise<ScraperJob | null> {
        const startTime = Date.now();

        while (Date.now() - startTime < maxWaitTime) {
            try {
                const response = await client.graphql({
                    query: /* GraphQL */ `
                        query GetScraperJob($id: ID!) {
                            getScraperJob(id: $id) {
                                id
                                status
                                totalURLsProcessed
                                newGamesScraped
                                gamesUpdated
                                gamesSkipped
                                errors
                                blanks
                                endTime
                                durationSeconds
                            }
                        }
                    `,
                    variables: { id: jobId }
                });

                // Type guard for GraphQL response
                if ('data' in response && response.data) {
                    const job = response.data.getScraperJob;

                    if (job.status === 'COMPLETED' || job.status === 'FAILED' || job.status === 'CANCELLED') {
                        return job;
                    }

                    // Update progress with current job stats
                    this.reportProgress({
                        jobStatus: job.status,
                        processed: job.totalURLsProcessed,
                        newGames: job.newGamesScraped
                    });
                }

            } catch (error) {
                console.error('Error polling job status:', error);
            }

            await this.delay(pollInterval);
        }

        console.warn(`Job ${jobId} did not complete within ${maxWaitTime}ms`);
        return null;
    }

    /**
     * Determine if we should stop scanning
     */
    private shouldStopScanning(batchResult: BatchResult): boolean {
        // Stop if the batch had only blanks/errors and no successful scrapes
        const totalProcessed = batchResult.stats.newGamesScraped + 
                              batchResult.stats.gamesUpdated;
        
        if (totalProcessed === 0 && batchResult.stats.blanks > 10) {
            // Likely hit a range with no tournaments
            return true;
        }

        // Check last 3 batches for patterns
        if (this.results.length >= 3) {
            const last3 = this.results.slice(-3);
            const totalSuccess = last3.reduce((sum, r) => 
                sum + r.stats.newGamesScraped + r.stats.gamesUpdated, 0
            );
            
            if (totalSuccess === 0) {
                // No successful scrapes in last 3 batches
                return true;
            }
        }

        return false;
    }

    /**
     * Report progress
     */
    private reportProgress(progress: any) {
        if (this.onProgressCallback) {
            this.onProgressCallback(progress);
        }
    }

    /**
     * Generate final summary
     */
    private reportSummary() {
        const totals = this.results.reduce((acc, batch) => ({
            newGamesScraped: acc.newGamesScraped + batch.stats.newGamesScraped,
            gamesUpdated: acc.gamesUpdated + batch.stats.gamesUpdated,
            errors: acc.errors + batch.stats.errors,
            blanks: acc.blanks + batch.stats.blanks,
            batches: acc.batches + 1
        }), {
            newGamesScraped: 0,
            gamesUpdated: 0,
            errors: 0,
            blanks: 0,
            batches: 0
        });

        console.log('\n=== BATCH SCAN SUMMARY ===');
        console.log(`Total Batches: ${totals.batches}`);
        console.log(`New Games Scraped: ${totals.newGamesScraped}`);
        console.log(`Games Updated: ${totals.gamesUpdated}`);
        console.log(`Errors: ${totals.errors}`);
        console.log(`Blanks: ${totals.blanks}`);
        console.log(`Success Rate: ${((totals.newGamesScraped + totals.gamesUpdated) / 
            (totals.newGamesScraped + totals.gamesUpdated + totals.errors + totals.blanks) * 100).toFixed(2)}%`);
    }

    /**
     * Stop the batch scan
     */
    stop() {
        this.isRunning = false;
    }

    /**
     * Utility delay function
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}