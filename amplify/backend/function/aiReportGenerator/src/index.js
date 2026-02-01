/* Amplify Params - DO NOT EDIT
	API_KINGSROOM_DIRECTORREPORTTABLE_ARN
	API_KINGSROOM_DIRECTORREPORTTABLE_NAME
	API_KINGSROOM_GRAPHQLAPIENDPOINTOUTPUT
	API_KINGSROOM_GRAPHQLAPIIDOUTPUT
	API_KINGSROOM_GRAPHQLAPIKEYOUTPUT
	API_KINGSROOM_METRICSPACKTABLE_ARN
	API_KINGSROOM_METRICSPACKTABLE_NAME
	ENV
	REGION
Amplify Params - DO NOT EDIT */

/**
 * AI Report Generator Lambda - ASYNC VERSION
 * ==========================================
 * Transforms MetricsPacks into AI-generated DirectorReports
 * 
 * VERSION: 3.1.0 - Fixed reportVersion field (was not being set)
 * 
 * Changes from v3.0:
 * - Now properly sets reportVersion field (required Int!)
 * - Increments version on regeneration
 * 
 * Changes from v2:
 * - Returns immediately with PENDING status
 * - Processes report asynchronously
 * - Supports status polling via getDirectorReportStatus
 * - No more client-side timeouts!
 * 
 * Report Status Flow:
 *   PENDING → GENERATING → COMPLETED
 *                       → FAILED
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const { getProvider, resolveModel } = require('./lib/llmProviders');
const { buildPrompts, getResponseSchema, getPromptVersion, validateMetricsPack } = require('./lib/prompts');
const { parseAndValidateReport, validatePackData } = require('./lib/reportParser');
const { getApiKey } = require('./lib/secretsManager');

// Initialize clients
const ddbClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-southeast-2' });
const docClient = DynamoDBDocumentClient.from(ddbClient);
const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION || 'ap-southeast-2' });

// Environment
const ENV = process.env.ENV || 'dev';
const API_ID = process.env.API_KINGSROOM_GRAPHQLAPIIDOUTPUT;
const FUNCTION_NAME = process.env.AWS_LAMBDA_FUNCTION_NAME;

// Default LLM configuration
const DEFAULT_PROVIDER = process.env.LLM_PROVIDER || 'openai';
const DEFAULT_MODEL = process.env.LLM_MODEL || 'gpt-4o-mini';

// Report status enum
const ReportStatus = {
  PENDING: 'PENDING',
  GENERATING: 'GENERATING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
};

/**
 * Construct table name from base name
 */
function getTableName(baseName) {
  return `${baseName}-${API_ID}-${ENV}`;
}

// Table names
const METRICS_PACK_TABLE = getTableName('MetricsPack');
const DIRECTOR_REPORT_TABLE = getTableName('DirectorReport');

/**
 * Main Lambda handler
 */
exports.handler = async (event, context) => {
  console.log('Event received:', JSON.stringify(event, null, 2));
  
  // Determine the operation from the GraphQL field name
  const fieldName = event.fieldName || event.field;
  
  // Check if this is an async processing invocation
  if (event._asyncProcess) {
    return await processReportAsync(event._asyncProcess);
  }
  
  try {
    switch (fieldName) {
      case 'generateDirectorReport':
        return await handleGenerateDirectorReport(event.arguments?.input || event.arguments, context);
      
      case 'getDirectorReport':
        return await handleGetDirectorReport(event.arguments);
      
      case 'getDirectorReportStatus':
        return await handleGetDirectorReportStatus(event.arguments);
      
      case 'listDirectorReports':
        return await handleListDirectorReports(event.arguments);
      
      case 'regenerateDirectorReport':
        return await handleRegenerateDirectorReport(event.arguments?.input || event.arguments, context);
      
      case 'previewReport':
        return await handlePreviewReport(event.arguments?.input || event.arguments);
      
      default:
        // If called directly (not through AppSync), check for operation in input
        if (event.operation) {
          switch (event.operation) {
            case 'generate':
              return await handleGenerateDirectorReport(event, context);
            case 'get':
              return await handleGetDirectorReport(event);
            case 'status':
              return await handleGetDirectorReportStatus(event);
            case 'list':
              return await handleListDirectorReports(event);
            case 'regenerate':
              return await handleRegenerateDirectorReport(event, context);
            case 'preview':
              return await handlePreviewReport(event);
            default:
              throw new Error(`Unknown operation: ${event.operation}`);
          }
        }
        throw new Error(`Unknown field: ${fieldName}`);
    }
  } catch (error) {
    console.error('Handler error:', error);
    return {
      success: false,
      error: error.message,
      stack: ENV === 'dev' ? error.stack : undefined,
    };
  }
};

/**
 * Generate a new DirectorReport - Returns immediately with PENDING status
 */
async function handleGenerateDirectorReport(input, context) {
  const startTime = Date.now();
  
  const {
    entityId,
    reportType,
    periodKey,
    metricsPackId,
    forceRegenerate = false,
    provider = DEFAULT_PROVIDER,
    model = DEFAULT_MODEL,
  } = input;
  
  console.log(`[ASYNC] Initiating ${reportType} report for entity ${entityId}, period ${periodKey || 'latest'}`);
  
  try {
    // Step 1: Get the MetricsPack
    let metricsPack;
    
    if (metricsPackId) {
      metricsPack = await getMetricsPackById(metricsPackId);
    } else if (periodKey) {
      metricsPack = await getMetricsPackByPeriod(entityId, reportType, periodKey);
    } else {
      metricsPack = await getLatestMetricsPack(entityId, reportType);
    }
    
    if (!metricsPack) {
      return {
        success: false,
        error: `No MetricsPack found for entity ${entityId}, reportType ${reportType}${periodKey ? `, period ${periodKey}` : ''}`,
      };
    }
    
    console.log(`Found MetricsPack: ${metricsPack.id}, version: ${metricsPack.version}`);
    
    // Step 2: Pre-validate pack data
    const parsedPackData = parseMetricsPack(metricsPack);
    const packValidation = validatePackData(parsedPackData);
    
    if (!packValidation.isValid) {
      console.warn('Pack has validation issues:', packValidation.issues);
    }
    
    // Step 3: Check for existing COMPLETED report (unless force regenerate)
    const reportId = `${entityId}_${reportType}_${metricsPack.periodKey}`;
    
    if (!forceRegenerate) {
      const existingReport = await getDirectorReportById(reportId);
      
      if (existingReport) {
        // If existing report is still processing, return its status
        if (existingReport.status === ReportStatus.PENDING || existingReport.status === ReportStatus.GENERATING) {
          console.log(`Report ${reportId} is already being generated, returning current status`);
          return {
            success: true,
            directorReportId: reportId,
            status: existingReport.status,
            statusMessage: 'Report generation already in progress',
            generationDurationMs: Date.now() - startTime,
          };
        }
        
        // If completed, return it
        if (existingReport.status === ReportStatus.COMPLETED || existingReport.status === 'GENERATED') {
          console.log(`Returning existing completed report: ${reportId}`);
          return {
            success: true,
            directorReportId: reportId,
            directorReport: formatReportForResponse(existingReport),
            status: ReportStatus.COMPLETED,
            wasRegenerated: false,
            generationDurationMs: Date.now() - startTime,
            packValidation,
          };
        }
      }
    }
    
    // Step 4: Create PENDING report record
    // Determine report version (increment if regenerating, otherwise start at 1)
    const existingForVersion = await getDirectorReportById(reportId);
    const reportVersion = existingForVersion?.reportVersion 
      ? existingForVersion.reportVersion + 1 
      : 1;
    
    const pendingReport = {
      id: reportId,
      entityId,
      reportType,
      periodKey: metricsPack.periodKey,
      periodLabel: metricsPack.periodLabel,
      periodStart: metricsPack.periodStart,
      periodEnd: metricsPack.periodEnd,
      metricsPackId: metricsPack.id,
      metricsPackVersion: metricsPack.version || 4,
      status: ReportStatus.PENDING,
      statusMessage: 'Report generation queued',
      requestedAt: new Date().toISOString(),
      requestedModel: model,
      requestedProvider: provider,
      reportVersion,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    await saveDirectorReport(pendingReport);
    console.log(`Created PENDING report: ${reportId}`);
    
    // Step 5: Invoke async processing
    const asyncPayload = {
      _asyncProcess: {
        reportId,
        entityId,
        reportType,
        metricsPackId: metricsPack.id,
        provider,
        model,
        forceRegenerate,
      },
    };
    
    try {
      await lambdaClient.send(new InvokeCommand({
        FunctionName: FUNCTION_NAME,
        InvocationType: 'Event', // Async invocation
        Payload: JSON.stringify(asyncPayload),
      }));
      console.log(`Triggered async processing for ${reportId}`);
    } catch (invokeError) {
      console.error('Failed to invoke async processing:', invokeError);
      // Update status to FAILED
      await updateReportStatus(reportId, ReportStatus.FAILED, `Failed to start generation: ${invokeError.message}`);
      return {
        success: false,
        directorReportId: reportId,
        status: ReportStatus.FAILED,
        error: `Failed to start report generation: ${invokeError.message}`,
      };
    }
    
    // Step 6: Return immediately with PENDING status
    return {
      success: true,
      directorReportId: reportId,
      status: ReportStatus.PENDING,
      statusMessage: 'Report generation started',
      generationDurationMs: Date.now() - startTime,
      packValidation,
      // Don't include directorReport - it's not ready yet
    };
    
  } catch (error) {
    console.error('Error initiating report generation:', error);
    return {
      success: false,
      error: error.message,
      generationDurationMs: Date.now() - startTime,
    };
  }
}

/**
 * Process report asynchronously (called via Lambda invoke)
 */
async function processReportAsync(params) {
  const startTime = Date.now();
  const { reportId, entityId, reportType, metricsPackId, provider, model, forceRegenerate } = params;
  
  console.log(`[ASYNC PROCESS] Starting generation for ${reportId}`);
  
  try {
    // Update status to GENERATING
    await updateReportStatus(reportId, ReportStatus.GENERATING, 'Generating report with AI...');
    
    // Get MetricsPack
    const metricsPack = await getMetricsPackById(metricsPackId);
    if (!metricsPack) {
      throw new Error(`MetricsPack not found: ${metricsPackId}`);
    }
    
    // Parse and validate pack data
    const parsedPackData = parseMetricsPack(metricsPack);
    const packValidation = validatePackData(parsedPackData);
    
    // Build prompts
    const { systemPrompt, userPrompt, promptVersion, packValidation: promptValidation } = buildPrompts(
      reportType,
      { ...metricsPack, packData: parsedPackData },
      { entityId }
    );
    
    console.log(`Prompt built. Version: ${promptVersion}, Enhanced modules: ${promptValidation.enhancedModulesAvailable.join(', ')}`);
    
    // Get LLM provider
    const { provider: resolvedProvider, model: resolvedModel } = resolveModel(model);
    const apiKey = await getApiKey(resolvedProvider);
    const llmProvider = getProvider(resolvedProvider, { apiKey, model: resolvedModel });
    
    console.log(`Using ${resolvedProvider}/${resolvedModel} for generation`);
    
    // Generate report with LLM
    const llmResult = await llmProvider.generateReport({
      systemPrompt,
      userPrompt,
      model: resolvedModel,
      maxTokens: 8192,
      temperature: 0.3,
      responseFormat: getResponseSchema(reportType),
    });
    
    if (!llmResult.success) {
      throw new Error(`LLM generation failed: ${llmResult.error}`);
    }
    
    console.log(`LLM generation successful. Tokens: ${llmResult.metadata.totalTokens}, Cost: $${llmResult.metadata.cost}`);
    
    // Parse and validate report
    let reportContent;
    try {
      reportContent = parseAndValidateReport(
        typeof llmResult.content === 'string' ? llmResult.content : JSON.stringify(llmResult.content),
        parsedPackData,
        reportType
      );
    } catch (parseError) {
      console.error('Report parsing failed:', parseError);
      reportContent = llmResult.content;
    }
    
    // Update the report with completed data
    const completedReport = {
      reportData: JSON.stringify(reportContent),
      status: ReportStatus.COMPLETED,
      statusMessage: 'Report generated successfully',
      generatedAt: new Date().toISOString(),
      generatedBy: 'AI_REPORT_GENERATOR',
      modelProvider: llmResult.metadata.provider,
      modelName: llmResult.metadata.model,
      modelVersion: llmResult.metadata.modelVersion,
      promptVersion,
      inputTokens: llmResult.metadata.inputTokens,
      outputTokens: llmResult.metadata.outputTokens,
      totalCost: llmResult.metadata.cost,
      generationDurationMs: Date.now() - startTime,
      enhancedModulesUsed: promptValidation.enhancedModulesAvailable,
      dataCompleteness: promptValidation.dataCompleteness,
      updatedAt: new Date().toISOString(),
    };
    
    await updateReportWithData(reportId, completedReport);
    console.log(`[ASYNC PROCESS] Report ${reportId} completed in ${Date.now() - startTime}ms`);
    
    return { success: true, reportId };
    
  } catch (error) {
    console.error(`[ASYNC PROCESS] Error generating report ${reportId}:`, error);
    
    // Update status to FAILED
    await updateReportStatus(
      reportId, 
      ReportStatus.FAILED, 
      `Generation failed: ${error.message}`,
      { error: error.message, failedAt: new Date().toISOString() }
    );
    
    return { success: false, reportId, error: error.message };
  }
}

/**
 * Get report status for polling
 */
async function handleGetDirectorReportStatus(args) {
  const { id, entityId, reportType, periodKey } = args;
  
  let reportId = id;
  if (!reportId && entityId && reportType && periodKey) {
    reportId = `${entityId}_${reportType}_${periodKey}`;
  }
  
  if (!reportId) {
    return {
      success: false,
      error: 'Must provide id or (entityId, reportType, periodKey)',
    };
  }
  
  const report = await getDirectorReportById(reportId);
  
  if (!report) {
    return {
      success: false,
      status: 'NOT_FOUND',
      error: `Report not found: ${reportId}`,
    };
  }
  
  // Return status info
  const response = {
    success: true,
    id: report.id,
    status: report.status || 'COMPLETED', // Legacy reports without status field
    statusMessage: report.statusMessage,
    requestedAt: report.requestedAt,
    generatedAt: report.generatedAt,
    generationDurationMs: report.generationDurationMs,
  };
  
  // Include full report if completed
  if (report.status === ReportStatus.COMPLETED || report.status === 'GENERATED' || !report.status) {
    response.directorReport = formatReportForResponse(report);
  }
  
  // Include error info if failed
  if (report.status === ReportStatus.FAILED) {
    response.error = report.error || report.statusMessage;
  }
  
  return response;
}

/**
 * Get an existing DirectorReport
 */
async function handleGetDirectorReport(args) {
  const { id, entityId, reportType, periodKey } = args;
  
  let report;
  
  if (id) {
    report = await getDirectorReportById(id);
  } else if (entityId && reportType && periodKey) {
    report = await getExistingReport(entityId, reportType, periodKey);
  } else {
    throw new Error('Must provide either id or (entityId, reportType, periodKey)');
  }
  
  if (!report) {
    return null;
  }
  
  return formatReportForResponse(report);
}

/**
 * List DirectorReports for an entity
 */
async function handleListDirectorReports(args) {
  const { entityId, reportType, limit = 10 } = args;
  
  const params = {
    TableName: DIRECTOR_REPORT_TABLE,
    IndexName: 'byEntityDirectorReport',
    KeyConditionExpression: 'entityId = :entityId',
    ExpressionAttributeValues: {
      ':entityId': entityId,
    },
    ScanIndexForward: false,
    Limit: limit,
  };
  
  if (reportType) {
    params.FilterExpression = 'reportType = :reportType';
    params.ExpressionAttributeValues[':reportType'] = reportType;
  }
  
  const result = await docClient.send(new QueryCommand(params));
  
  return (result.Items || []).map(formatReportForResponse);
}

/**
 * Regenerate a DirectorReport
 */
async function handleRegenerateDirectorReport(input, context) {
  const { directorReportId, reason = 'Manual regeneration', provider, model } = input;
  
  const existingReport = await getDirectorReportById(directorReportId);
  if (!existingReport) {
    return {
      success: false,
      error: `DirectorReport not found: ${directorReportId}`,
    };
  }
  
  // Store regeneration metadata
  await docClient.send(new UpdateCommand({
    TableName: DIRECTOR_REPORT_TABLE,
    Key: { id: directorReportId },
    UpdateExpression: 'SET regenerationReason = :reason, previousReportVersion = :version, updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':reason': reason,
      ':version': existingReport.reportVersion || 1,
      ':updatedAt': new Date().toISOString(),
    },
  }));
  
  // Generate with forceRegenerate
  return await handleGenerateDirectorReport({
    entityId: existingReport.entityId,
    reportType: existingReport.reportType,
    periodKey: existingReport.periodKey,
    metricsPackId: existingReport.metricsPackId,
    forceRegenerate: true,
    provider: provider || existingReport.modelProvider,
    model: model || existingReport.modelName,
  }, context);
}

/**
 * Preview a report without saving
 */
async function handlePreviewReport(input) {
  const startTime = Date.now();
  const { entityId, reportType, periodKey, metricsPackId } = input;
  
  try {
    let metricsPack;
    if (metricsPackId) {
      metricsPack = await getMetricsPackById(metricsPackId);
    } else if (periodKey) {
      metricsPack = await getMetricsPackByPeriod(entityId, reportType, periodKey);
    } else {
      metricsPack = await getLatestMetricsPack(entityId, reportType);
    }
    
    if (!metricsPack) {
      return { success: false, error: 'MetricsPack not found' };
    }
    
    const parsedPackData = parseMetricsPack(metricsPack);
    const packValidation = validatePackData(parsedPackData);
    
    const { systemPrompt, userPrompt, promptVersion, packValidation: promptValidation } = buildPrompts(
      reportType,
      { ...metricsPack, packData: parsedPackData },
      { entityId }
    );
    
    return {
      success: true,
      preview: true,
      metricsPackId: metricsPack.id,
      periodKey: metricsPack.periodKey,
      promptVersion,
      systemPromptLength: systemPrompt.length,
      userPromptLength: userPrompt.length,
      packValidation,
      enhancedModulesAvailable: promptValidation.enhancedModulesAvailable,
      enhancedModulesMissing: promptValidation.enhancedModulesMissing,
      dataCompleteness: promptValidation.dataCompleteness,
      prompts: ENV === 'dev' ? {
        systemPrompt: systemPrompt.substring(0, 2000) + (systemPrompt.length > 2000 ? '...' : ''),
        userPrompt: userPrompt.substring(0, 5000) + (userPrompt.length > 5000 ? '...' : ''),
      } : undefined,
      generationDurationMs: Date.now() - startTime,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ============================================================
// Helper Functions
// ============================================================

function parseMetricsPack(metricsPack) {
  let packData = metricsPack.packData;
  if (typeof packData === 'string') {
    try {
      packData = JSON.parse(packData);
    } catch (e) {
      console.error('Failed to parse packData:', e);
      packData = {};
    }
  }
  return packData;
}

function formatReportForResponse(report) {
  return {
    ...report,
    reportData: typeof report.reportData === 'string' 
      ? JSON.parse(report.reportData) 
      : report.reportData,
  };
}

// ============================================================
// Database Helper Functions
// ============================================================

async function getMetricsPackById(id) {
  const result = await docClient.send(new GetCommand({
    TableName: METRICS_PACK_TABLE,
    Key: { id },
  }));
  return result.Item;
}

async function getMetricsPackByPeriod(entityId, reportType, periodKey) {
  const id = `${entityId}_${reportType}_${periodKey}`;
  return getMetricsPackById(id);
}

async function getLatestMetricsPack(entityId, reportType) {
  const result = await docClient.send(new QueryCommand({
    TableName: METRICS_PACK_TABLE,
    IndexName: 'byEntityMetricsPack',
    KeyConditionExpression: 'entityId = :entityId',
    FilterExpression: 'reportType = :reportType',
    ExpressionAttributeValues: {
      ':entityId': entityId,
      ':reportType': reportType,
    },
    ScanIndexForward: false,
    Limit: 1,
  }));
  return result.Items?.[0];
}

async function getExistingReport(entityId, reportType, periodKey) {
  const id = `${entityId}_${reportType}_${periodKey}`;
  return getDirectorReportById(id);
}

async function getDirectorReportById(id) {
  const result = await docClient.send(new GetCommand({
    TableName: DIRECTOR_REPORT_TABLE,
    Key: { id },
  }));
  return result.Item;
}

async function saveDirectorReport(report) {
  await docClient.send(new PutCommand({
    TableName: DIRECTOR_REPORT_TABLE,
    Item: report,
  }));
}

async function updateReportStatus(reportId, status, statusMessage, additionalFields = {}) {
  const updateExpression = [
    'SET #status = :status',
    'statusMessage = :statusMessage',
    'updatedAt = :updatedAt',
  ];
  const expressionValues = {
    ':status': status,
    ':statusMessage': statusMessage,
    ':updatedAt': new Date().toISOString(),
  };
  
  // Add any additional fields
  Object.entries(additionalFields).forEach(([key, value]) => {
    updateExpression.push(`${key} = :${key}`);
    expressionValues[`:${key}`] = value;
  });
  
  await docClient.send(new UpdateCommand({
    TableName: DIRECTOR_REPORT_TABLE,
    Key: { id: reportId },
    UpdateExpression: updateExpression.join(', '),
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: expressionValues,
  }));
}

async function updateReportWithData(reportId, data) {
  const updateParts = [];
  const expressionNames = {};
  const expressionValues = {};
  
  Object.entries(data).forEach(([key, value]) => {
    const attrName = `#${key}`;
    const attrValue = `:${key}`;
    updateParts.push(`${attrName} = ${attrValue}`);
    expressionNames[attrName] = key;
    expressionValues[attrValue] = value;
  });
  
  await docClient.send(new UpdateCommand({
    TableName: DIRECTOR_REPORT_TABLE,
    Key: { id: reportId },
    UpdateExpression: `SET ${updateParts.join(', ')}`,
    ExpressionAttributeNames: expressionNames,
    ExpressionAttributeValues: expressionValues,
  }));
}