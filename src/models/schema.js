export const schema = {
    "models": {
        "Entity": {
            "name": "Entity",
            "fields": {
                "id": {
                    "name": "id",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "entityName": {
                    "name": "entityName",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "gameUrlDomain": {
                    "name": "gameUrlDomain",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "gameUrlPath": {
                    "name": "gameUrlPath",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "entityLogo": {
                    "name": "entityLogo",
                    "isArray": false,
                    "type": "AWSURL",
                    "isRequired": false,
                    "attributes": []
                },
                "isActive": {
                    "name": "isActive",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": true,
                    "attributes": []
                },
                "createdAt": {
                    "name": "createdAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": true,
                    "attributes": []
                },
                "updatedAt": {
                    "name": "updatedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": true,
                    "attributes": []
                },
                "scraperStates": {
                    "name": "scraperStates",
                    "isArray": true,
                    "type": {
                        "model": "ScraperState"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true,
                    "association": {
                        "connectionType": "HAS_MANY",
                        "associatedWith": [
                            "entity"
                        ]
                    }
                },
                "scraperJobs": {
                    "name": "scraperJobs",
                    "isArray": true,
                    "type": {
                        "model": "ScraperJob"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true,
                    "association": {
                        "connectionType": "HAS_MANY",
                        "associatedWith": [
                            "entity"
                        ]
                    }
                },
                "scrapeURLs": {
                    "name": "scrapeURLs",
                    "isArray": true,
                    "type": {
                        "model": "ScrapeURL"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true,
                    "association": {
                        "connectionType": "HAS_MANY",
                        "associatedWith": [
                            "entity"
                        ]
                    }
                },
                "venues": {
                    "name": "venues",
                    "isArray": true,
                    "type": {
                        "model": "Venue"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true,
                    "association": {
                        "connectionType": "HAS_MANY",
                        "associatedWith": [
                            "entity"
                        ]
                    }
                },
                "games": {
                    "name": "games",
                    "isArray": true,
                    "type": {
                        "model": "Game"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true,
                    "association": {
                        "connectionType": "HAS_MANY",
                        "associatedWith": [
                            "entity"
                        ]
                    }
                },
                "assets": {
                    "name": "assets",
                    "isArray": true,
                    "type": {
                        "model": "Asset"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true,
                    "association": {
                        "connectionType": "HAS_MANY",
                        "associatedWith": [
                            "entity"
                        ]
                    }
                }
            },
            "syncable": true,
            "pluralName": "Entities",
            "attributes": [
                {
                    "type": "model",
                    "properties": {}
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byEntityName",
                        "fields": [
                            "entityName"
                        ]
                    }
                },
                {
                    "type": "auth",
                    "properties": {
                        "rules": [
                            {
                                "allow": "private",
                                "operations": [
                                    "create",
                                    "update",
                                    "delete",
                                    "read"
                                ]
                            }
                        ]
                    }
                }
            ]
        },
        "ScrapeStructure": {
            "name": "ScrapeStructure",
            "fields": {
                "id": {
                    "name": "id",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "fields": {
                    "name": "fields",
                    "isArray": true,
                    "type": "String",
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": false
                },
                "structureLabel": {
                    "name": "structureLabel",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "occurrenceCount": {
                    "name": "occurrenceCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "firstSeenAt": {
                    "name": "firstSeenAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": true,
                    "attributes": []
                },
                "lastSeenAt": {
                    "name": "lastSeenAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": true,
                    "attributes": []
                },
                "exampleUrl": {
                    "name": "exampleUrl",
                    "isArray": false,
                    "type": "AWSURL",
                    "isRequired": false,
                    "attributes": []
                },
                "createdAt": {
                    "name": "createdAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                },
                "updatedAt": {
                    "name": "updatedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                }
            },
            "syncable": true,
            "pluralName": "ScrapeStructures",
            "attributes": [
                {
                    "type": "model",
                    "properties": {}
                },
                {
                    "type": "auth",
                    "properties": {
                        "rules": [
                            {
                                "allow": "private",
                                "operations": [
                                    "create",
                                    "update",
                                    "delete",
                                    "read"
                                ]
                            }
                        ]
                    }
                }
            ]
        },
        "DataSync": {
            "name": "DataSync",
            "fields": {
                "id": {
                    "name": "id",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "syncedAt": {
                    "name": "syncedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": true,
                    "attributes": []
                },
                "method": {
                    "name": "method",
                    "isArray": false,
                    "type": {
                        "enum": "DataSource"
                    },
                    "isRequired": true,
                    "attributes": []
                },
                "sourceUrl": {
                    "name": "sourceUrl",
                    "isArray": false,
                    "type": "AWSURL",
                    "isRequired": false,
                    "attributes": []
                },
                "title": {
                    "name": "title",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "content": {
                    "name": "content",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "createdAt": {
                    "name": "createdAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                },
                "updatedAt": {
                    "name": "updatedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                }
            },
            "syncable": true,
            "pluralName": "DataSyncs",
            "attributes": [
                {
                    "type": "model",
                    "properties": {}
                },
                {
                    "type": "auth",
                    "properties": {
                        "rules": [
                            {
                                "allow": "private",
                                "operations": [
                                    "create",
                                    "update",
                                    "delete",
                                    "read"
                                ]
                            }
                        ]
                    }
                }
            ]
        },
        "ScraperState": {
            "name": "ScraperState",
            "fields": {
                "id": {
                    "name": "id",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "isRunning": {
                    "name": "isRunning",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": true,
                    "attributes": []
                },
                "lastScannedId": {
                    "name": "lastScannedId",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "lastRunStartTime": {
                    "name": "lastRunStartTime",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "lastRunEndTime": {
                    "name": "lastRunEndTime",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "consecutiveBlankCount": {
                    "name": "consecutiveBlankCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "totalScraped": {
                    "name": "totalScraped",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "totalErrors": {
                    "name": "totalErrors",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "enabled": {
                    "name": "enabled",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": true,
                    "attributes": []
                },
                "currentLog": {
                    "name": "currentLog",
                    "isArray": true,
                    "type": {
                        "nonModel": "ScraperLogData"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "lastGamesProcessed": {
                    "name": "lastGamesProcessed",
                    "isArray": true,
                    "type": {
                        "nonModel": "ScrapedGameStatus"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "entityId": {
                    "name": "entityId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "entity": {
                    "name": "entity",
                    "isArray": false,
                    "type": {
                        "model": "Entity"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "association": {
                        "connectionType": "BELONGS_TO",
                        "targetNames": [
                            "entityId"
                        ]
                    }
                },
                "createdAt": {
                    "name": "createdAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                },
                "updatedAt": {
                    "name": "updatedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                }
            },
            "syncable": true,
            "pluralName": "ScraperStates",
            "attributes": [
                {
                    "type": "model",
                    "properties": {}
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byEntityScraperState",
                        "fields": [
                            "entityId"
                        ]
                    }
                },
                {
                    "type": "auth",
                    "properties": {
                        "rules": [
                            {
                                "allow": "private",
                                "operations": [
                                    "create",
                                    "update",
                                    "delete",
                                    "read"
                                ]
                            }
                        ]
                    }
                }
            ]
        },
        "Venue": {
            "name": "Venue",
            "fields": {
                "id": {
                    "name": "id",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "venueNumber": {
                    "name": "venueNumber",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "name": {
                    "name": "name",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "aliases": {
                    "name": "aliases",
                    "isArray": true,
                    "type": "String",
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "address": {
                    "name": "address",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "city": {
                    "name": "city",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "country": {
                    "name": "country",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "isSpecial": {
                    "name": "isSpecial",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "details": {
                    "name": "details",
                    "isArray": false,
                    "type": {
                        "model": "VenueDetails"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "association": {
                        "connectionType": "HAS_ONE",
                        "associatedWith": [
                            "id"
                        ],
                        "targetNames": [
                            "venueDetailsId"
                        ]
                    }
                },
                "assets": {
                    "name": "assets",
                    "isArray": true,
                    "type": {
                        "model": "Asset"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true,
                    "association": {
                        "connectionType": "HAS_MANY",
                        "associatedWith": [
                            "venue"
                        ]
                    }
                },
                "games": {
                    "name": "games",
                    "isArray": true,
                    "type": {
                        "model": "Game"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true,
                    "association": {
                        "connectionType": "HAS_MANY",
                        "associatedWith": [
                            "venue"
                        ]
                    }
                },
                "series": {
                    "name": "series",
                    "isArray": true,
                    "type": {
                        "model": "TournamentSeries"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true,
                    "association": {
                        "connectionType": "HAS_MANY",
                        "associatedWith": [
                            "venue"
                        ]
                    }
                },
                "playerMemberships": {
                    "name": "playerMemberships",
                    "isArray": true,
                    "type": {
                        "model": "PlayerVenue"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true,
                    "association": {
                        "connectionType": "HAS_MANY",
                        "associatedWith": [
                            "venue"
                        ]
                    }
                },
                "registeredPlayers": {
                    "name": "registeredPlayers",
                    "isArray": true,
                    "type": {
                        "model": "Player"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true,
                    "association": {
                        "connectionType": "HAS_MANY",
                        "associatedWith": [
                            "registrationVenue"
                        ]
                    }
                },
                "entityId": {
                    "name": "entityId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "entity": {
                    "name": "entity",
                    "isArray": false,
                    "type": {
                        "model": "Entity"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "association": {
                        "connectionType": "BELONGS_TO",
                        "targetNames": [
                            "entityId"
                        ]
                    }
                },
                "createdAt": {
                    "name": "createdAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                },
                "updatedAt": {
                    "name": "updatedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                },
                "venueDetailsId": {
                    "name": "venueDetailsId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                }
            },
            "syncable": true,
            "pluralName": "Venues",
            "attributes": [
                {
                    "type": "model",
                    "properties": {}
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byVenueNumber",
                        "fields": [
                            "venueNumber",
                            "name"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byEntityVenue",
                        "fields": [
                            "entityId",
                            "name"
                        ]
                    }
                },
                {
                    "type": "auth",
                    "properties": {
                        "rules": [
                            {
                                "allow": "private",
                                "operations": [
                                    "create",
                                    "update",
                                    "delete",
                                    "read"
                                ]
                            }
                        ]
                    }
                }
            ]
        },
        "VenueDetails": {
            "name": "VenueDetails",
            "fields": {
                "id": {
                    "name": "id",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "startDate": {
                    "name": "startDate",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": true,
                    "attributes": []
                },
                "status": {
                    "name": "status",
                    "isArray": false,
                    "type": {
                        "enum": "VenueStatus"
                    },
                    "isRequired": true,
                    "attributes": []
                },
                "lastCustomerSuccessVisit": {
                    "name": "lastCustomerSuccessVisit",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "totalGamesHeld": {
                    "name": "totalGamesHeld",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "averagePlayersPerGame": {
                    "name": "averagePlayersPerGame",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "gameNights": {
                    "name": "gameNights",
                    "isArray": true,
                    "type": "String",
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "venueId": {
                    "name": "venueId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "venue": {
                    "name": "venue",
                    "isArray": false,
                    "type": {
                        "model": "Venue"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "association": {
                        "connectionType": "BELONGS_TO",
                        "targetNames": [
                            "venueId"
                        ]
                    }
                },
                "createdAt": {
                    "name": "createdAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                },
                "updatedAt": {
                    "name": "updatedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                }
            },
            "syncable": true,
            "pluralName": "VenueDetails",
            "attributes": [
                {
                    "type": "model",
                    "properties": {}
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byVenue",
                        "fields": [
                            "venueId"
                        ]
                    }
                },
                {
                    "type": "auth",
                    "properties": {
                        "rules": [
                            {
                                "allow": "private",
                                "operations": [
                                    "create",
                                    "update",
                                    "delete",
                                    "read"
                                ]
                            }
                        ]
                    }
                }
            ]
        },
        "TournamentSeriesTitle": {
            "name": "TournamentSeriesTitle",
            "fields": {
                "id": {
                    "name": "id",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "title": {
                    "name": "title",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "aliases": {
                    "name": "aliases",
                    "isArray": true,
                    "type": "String",
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "seriesInstances": {
                    "name": "seriesInstances",
                    "isArray": true,
                    "type": {
                        "model": "TournamentSeries"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true,
                    "association": {
                        "connectionType": "HAS_MANY",
                        "associatedWith": [
                            "title"
                        ]
                    }
                },
                "createdAt": {
                    "name": "createdAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                },
                "updatedAt": {
                    "name": "updatedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                }
            },
            "syncable": true,
            "pluralName": "TournamentSeriesTitles",
            "attributes": [
                {
                    "type": "model",
                    "properties": {}
                },
                {
                    "type": "auth",
                    "properties": {
                        "rules": [
                            {
                                "allow": "private",
                                "operations": [
                                    "create",
                                    "update",
                                    "delete",
                                    "read"
                                ]
                            }
                        ]
                    }
                }
            ]
        },
        "TournamentSeries": {
            "name": "TournamentSeries",
            "fields": {
                "id": {
                    "name": "id",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "name": {
                    "name": "name",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "year": {
                    "name": "year",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "status": {
                    "name": "status",
                    "isArray": false,
                    "type": {
                        "enum": "SeriesStatus"
                    },
                    "isRequired": true,
                    "attributes": []
                },
                "startDate": {
                    "name": "startDate",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "endDate": {
                    "name": "endDate",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "events": {
                    "name": "events",
                    "isArray": true,
                    "type": "String",
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "numberOfEvents": {
                    "name": "numberOfEvents",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "guaranteedPrizepool": {
                    "name": "guaranteedPrizepool",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "estimatedPrizepool": {
                    "name": "estimatedPrizepool",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "actualPrizepool": {
                    "name": "actualPrizepool",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "tournamentSeriesTitleId": {
                    "name": "tournamentSeriesTitleId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "title": {
                    "name": "title",
                    "isArray": false,
                    "type": {
                        "model": "TournamentSeriesTitle"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "association": {
                        "connectionType": "BELONGS_TO",
                        "targetNames": [
                            "tournamentSeriesTitleId"
                        ]
                    }
                },
                "venueId": {
                    "name": "venueId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "venue": {
                    "name": "venue",
                    "isArray": false,
                    "type": {
                        "model": "Venue"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "association": {
                        "connectionType": "BELONGS_TO",
                        "targetNames": [
                            "venueId"
                        ]
                    }
                },
                "games": {
                    "name": "games",
                    "isArray": true,
                    "type": {
                        "model": "Game"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true,
                    "association": {
                        "connectionType": "HAS_MANY",
                        "associatedWith": [
                            "tournamentSeries"
                        ]
                    }
                },
                "createdAt": {
                    "name": "createdAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                },
                "updatedAt": {
                    "name": "updatedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                }
            },
            "syncable": true,
            "pluralName": "TournamentSeries",
            "attributes": [
                {
                    "type": "model",
                    "properties": {}
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byTournamentSeriesTitle",
                        "fields": [
                            "tournamentSeriesTitleId",
                            "year"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byVenue",
                        "fields": [
                            "venueId"
                        ]
                    }
                },
                {
                    "type": "auth",
                    "properties": {
                        "rules": [
                            {
                                "allow": "private",
                                "operations": [
                                    "create",
                                    "update",
                                    "delete",
                                    "read"
                                ]
                            }
                        ]
                    }
                }
            ]
        },
        "Game": {
            "name": "Game",
            "fields": {
                "id": {
                    "name": "id",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "name": {
                    "name": "name",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "gameType": {
                    "name": "gameType",
                    "isArray": false,
                    "type": {
                        "enum": "GameType"
                    },
                    "isRequired": true,
                    "attributes": []
                },
                "gameVariant": {
                    "name": "gameVariant",
                    "isArray": false,
                    "type": {
                        "enum": "GameVariant"
                    },
                    "isRequired": true,
                    "attributes": []
                },
                "gameStatus": {
                    "name": "gameStatus",
                    "isArray": false,
                    "type": {
                        "enum": "GameStatus"
                    },
                    "isRequired": true,
                    "attributes": []
                },
                "gameStartDateTime": {
                    "name": "gameStartDateTime",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": true,
                    "attributes": []
                },
                "gameEndDateTime": {
                    "name": "gameEndDateTime",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "registrationStatus": {
                    "name": "registrationStatus",
                    "isArray": false,
                    "type": {
                        "enum": "RegistrationStatus"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "totalDuration": {
                    "name": "totalDuration",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "gameFrequency": {
                    "name": "gameFrequency",
                    "isArray": false,
                    "type": {
                        "enum": "GameFrequency"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "buyIn": {
                    "name": "buyIn",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "rake": {
                    "name": "rake",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "startingStack": {
                    "name": "startingStack",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "hasGuarantee": {
                    "name": "hasGuarantee",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "guaranteeAmount": {
                    "name": "guaranteeAmount",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "prizepool": {
                    "name": "prizepool",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalEntries": {
                    "name": "totalEntries",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "totalRebuys": {
                    "name": "totalRebuys",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "totalAddons": {
                    "name": "totalAddons",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "revenueByBuyIns": {
                    "name": "revenueByBuyIns",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalRake": {
                    "name": "totalRake",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "profitLoss": {
                    "name": "profitLoss",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "guaranteeOverlay": {
                    "name": "guaranteeOverlay",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "guaranteeSurplus": {
                    "name": "guaranteeSurplus",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "playersRemaining": {
                    "name": "playersRemaining",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "totalChipsInPlay": {
                    "name": "totalChipsInPlay",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "averagePlayerStack": {
                    "name": "averagePlayerStack",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "tournamentType": {
                    "name": "tournamentType",
                    "isArray": false,
                    "type": {
                        "enum": "TournamentType"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "isRegular": {
                    "name": "isRegular",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "isSeries": {
                    "name": "isSeries",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "isSatellite": {
                    "name": "isSatellite",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "seriesName": {
                    "name": "seriesName",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "gameTags": {
                    "name": "gameTags",
                    "isArray": true,
                    "type": "String",
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "sourceUrl": {
                    "name": "sourceUrl",
                    "isArray": false,
                    "type": "AWSURL",
                    "isRequired": false,
                    "attributes": []
                },
                "tournamentId": {
                    "name": "tournamentId",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "dataSource": {
                    "name": "dataSource",
                    "isArray": false,
                    "type": {
                        "enum": "DataSource"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "originalScrapedData": {
                    "name": "originalScrapedData",
                    "isArray": false,
                    "type": "AWSJSON",
                    "isRequired": false,
                    "attributes": []
                },
                "venueAssignmentStatus": {
                    "name": "venueAssignmentStatus",
                    "isArray": false,
                    "type": {
                        "enum": "VenueAssignmentStatus"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "requiresVenueAssignment": {
                    "name": "requiresVenueAssignment",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "suggestedVenueName": {
                    "name": "suggestedVenueName",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "venueAssignmentConfidence": {
                    "name": "venueAssignmentConfidence",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "venueId": {
                    "name": "venueId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "venue": {
                    "name": "venue",
                    "isArray": false,
                    "type": {
                        "model": "Venue"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "association": {
                        "connectionType": "BELONGS_TO",
                        "targetNames": [
                            "venueId"
                        ]
                    }
                },
                "tournamentSeriesId": {
                    "name": "tournamentSeriesId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "tournamentSeries": {
                    "name": "tournamentSeries",
                    "isArray": false,
                    "type": {
                        "model": "TournamentSeries"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "association": {
                        "connectionType": "BELONGS_TO",
                        "targetNames": [
                            "tournamentSeriesId"
                        ]
                    }
                },
                "structure": {
                    "name": "structure",
                    "isArray": false,
                    "type": {
                        "model": "TournamentStructure"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "association": {
                        "connectionType": "HAS_ONE",
                        "associatedWith": [
                            "id"
                        ],
                        "targetNames": [
                            "gameStructureId"
                        ]
                    }
                },
                "playerEntries": {
                    "name": "playerEntries",
                    "isArray": true,
                    "type": {
                        "model": "PlayerEntry"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true,
                    "association": {
                        "connectionType": "HAS_MANY",
                        "associatedWith": [
                            "game"
                        ]
                    }
                },
                "playerResults": {
                    "name": "playerResults",
                    "isArray": true,
                    "type": {
                        "model": "PlayerResult"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true,
                    "association": {
                        "connectionType": "HAS_MANY",
                        "associatedWith": [
                            "game"
                        ]
                    }
                },
                "entityId": {
                    "name": "entityId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "entity": {
                    "name": "entity",
                    "isArray": false,
                    "type": {
                        "model": "Entity"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "association": {
                        "connectionType": "BELONGS_TO",
                        "targetNames": [
                            "entityId"
                        ]
                    }
                },
                "createdAt": {
                    "name": "createdAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": true,
                    "attributes": []
                },
                "updatedAt": {
                    "name": "updatedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": true,
                    "attributes": []
                },
                "gameStructureId": {
                    "name": "gameStructureId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                }
            },
            "syncable": true,
            "pluralName": "Games",
            "attributes": [
                {
                    "type": "model",
                    "properties": {}
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byStatus",
                        "queryField": "gamesByStatus",
                        "fields": [
                            "gameStatus",
                            "gameStartDateTime"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byRegistrationStatus",
                        "queryField": "gamesByRegistrationStatus",
                        "fields": [
                            "registrationStatus",
                            "gameStartDateTime"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "bySourceUrl",
                        "queryField": "gameBySourceUrl",
                        "fields": [
                            "sourceUrl"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byVenue",
                        "fields": [
                            "venueId",
                            "gameStartDateTime"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byTournamentSeries",
                        "fields": [
                            "tournamentSeriesId",
                            "gameStartDateTime"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byEntityGame",
                        "fields": [
                            "entityId",
                            "gameStartDateTime"
                        ]
                    }
                },
                {
                    "type": "auth",
                    "properties": {
                        "rules": [
                            {
                                "allow": "private",
                                "operations": [
                                    "create",
                                    "update",
                                    "delete",
                                    "read"
                                ]
                            }
                        ]
                    }
                }
            ]
        },
        "TournamentStructure": {
            "name": "TournamentStructure",
            "fields": {
                "id": {
                    "name": "id",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "levels": {
                    "name": "levels",
                    "isArray": true,
                    "type": {
                        "nonModel": "TournamentLevel"
                    },
                    "isRequired": true,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "breaks": {
                    "name": "breaks",
                    "isArray": true,
                    "type": {
                        "nonModel": "Break"
                    },
                    "isRequired": true,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "gameId": {
                    "name": "gameId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "game": {
                    "name": "game",
                    "isArray": false,
                    "type": {
                        "model": "Game"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "association": {
                        "connectionType": "BELONGS_TO",
                        "targetNames": [
                            "gameId"
                        ]
                    }
                },
                "createdAt": {
                    "name": "createdAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                },
                "updatedAt": {
                    "name": "updatedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                }
            },
            "syncable": true,
            "pluralName": "TournamentStructures",
            "attributes": [
                {
                    "type": "model",
                    "properties": {}
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byGame",
                        "fields": [
                            "gameId"
                        ]
                    }
                },
                {
                    "type": "auth",
                    "properties": {
                        "rules": [
                            {
                                "allow": "private",
                                "operations": [
                                    "create",
                                    "update",
                                    "delete",
                                    "read"
                                ]
                            }
                        ]
                    }
                }
            ]
        },
        "TournamentLevelData": {
            "name": "TournamentLevelData",
            "fields": {
                "id": {
                    "name": "id",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "levels": {
                    "name": "levels",
                    "isArray": true,
                    "type": {
                        "nonModel": "TournamentLevel"
                    },
                    "isRequired": true,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "gameId": {
                    "name": "gameId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "createdAt": {
                    "name": "createdAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                },
                "updatedAt": {
                    "name": "updatedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                }
            },
            "syncable": true,
            "pluralName": "TournamentLevelData",
            "attributes": [
                {
                    "type": "model",
                    "properties": {}
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byGame",
                        "fields": [
                            "gameId"
                        ]
                    }
                },
                {
                    "type": "auth",
                    "properties": {
                        "rules": [
                            {
                                "allow": "private",
                                "operations": [
                                    "create",
                                    "update",
                                    "delete",
                                    "read"
                                ]
                            }
                        ]
                    }
                }
            ]
        },
        "CashStructure": {
            "name": "CashStructure",
            "fields": {
                "id": {
                    "name": "id",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "stakes": {
                    "name": "stakes",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "minBuyIn": {
                    "name": "minBuyIn",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "maxBuyIn": {
                    "name": "maxBuyIn",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "gameId": {
                    "name": "gameId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "createdAt": {
                    "name": "createdAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                },
                "updatedAt": {
                    "name": "updatedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                }
            },
            "syncable": true,
            "pluralName": "CashStructures",
            "attributes": [
                {
                    "type": "model",
                    "properties": {}
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byGame",
                        "fields": [
                            "gameId"
                        ]
                    }
                },
                {
                    "type": "auth",
                    "properties": {
                        "rules": [
                            {
                                "allow": "private",
                                "operations": [
                                    "create",
                                    "update",
                                    "delete",
                                    "read"
                                ]
                            }
                        ]
                    }
                }
            ]
        },
        "RakeStructure": {
            "name": "RakeStructure",
            "fields": {
                "id": {
                    "name": "id",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "rakePercentage": {
                    "name": "rakePercentage",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "rakeCap": {
                    "name": "rakeCap",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "gameId": {
                    "name": "gameId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "createdAt": {
                    "name": "createdAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                },
                "updatedAt": {
                    "name": "updatedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                }
            },
            "syncable": true,
            "pluralName": "RakeStructures",
            "attributes": [
                {
                    "type": "model",
                    "properties": {}
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byGame",
                        "fields": [
                            "gameId"
                        ]
                    }
                },
                {
                    "type": "auth",
                    "properties": {
                        "rules": [
                            {
                                "allow": "private",
                                "operations": [
                                    "create",
                                    "update",
                                    "delete",
                                    "read"
                                ]
                            }
                        ]
                    }
                }
            ]
        },
        "Player": {
            "name": "Player",
            "fields": {
                "id": {
                    "name": "id",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "primaryEntityId": {
                    "name": "primaryEntityId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "firstName": {
                    "name": "firstName",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "lastName": {
                    "name": "lastName",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "phone": {
                    "name": "phone",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "email": {
                    "name": "email",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "status": {
                    "name": "status",
                    "isArray": false,
                    "type": {
                        "enum": "PlayerAccountStatus"
                    },
                    "isRequired": true,
                    "attributes": []
                },
                "category": {
                    "name": "category",
                    "isArray": false,
                    "type": {
                        "enum": "PlayerAccountCategory"
                    },
                    "isRequired": true,
                    "attributes": []
                },
                "targetingClassification": {
                    "name": "targetingClassification",
                    "isArray": false,
                    "type": {
                        "enum": "PlayerTargetingClassification"
                    },
                    "isRequired": true,
                    "attributes": []
                },
                "registrationDate": {
                    "name": "registrationDate",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": true,
                    "attributes": []
                },
                "firstGamePlayed": {
                    "name": "firstGamePlayed",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "lastPlayedDate": {
                    "name": "lastPlayedDate",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "creditBalance": {
                    "name": "creditBalance",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "pointsBalance": {
                    "name": "pointsBalance",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "playerSummary": {
                    "name": "playerSummary",
                    "isArray": false,
                    "type": {
                        "model": "PlayerSummary"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "association": {
                        "connectionType": "HAS_ONE",
                        "associatedWith": [
                            "id"
                        ],
                        "targetNames": [
                            "id"
                        ]
                    }
                },
                "knownIdentities": {
                    "name": "knownIdentities",
                    "isArray": true,
                    "type": {
                        "model": "KnownPlayerIdentity"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true,
                    "association": {
                        "connectionType": "HAS_MANY",
                        "associatedWith": [
                            "player"
                        ]
                    }
                },
                "marketingPreferences": {
                    "name": "marketingPreferences",
                    "isArray": false,
                    "type": {
                        "model": "PlayerMarketingPreferences"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "association": {
                        "connectionType": "HAS_ONE",
                        "associatedWith": [
                            "id"
                        ],
                        "targetNames": [
                            "id"
                        ]
                    }
                },
                "marketingMessages": {
                    "name": "marketingMessages",
                    "isArray": true,
                    "type": {
                        "model": "PlayerMarketingMessage"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true,
                    "association": {
                        "connectionType": "HAS_MANY",
                        "associatedWith": [
                            "playerId"
                        ]
                    }
                },
                "playerVenues": {
                    "name": "playerVenues",
                    "isArray": true,
                    "type": {
                        "model": "PlayerVenue"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true,
                    "association": {
                        "connectionType": "HAS_MANY",
                        "associatedWith": [
                            "venueId"
                        ]
                    }
                },
                "playerEntries": {
                    "name": "playerEntries",
                    "isArray": true,
                    "type": {
                        "model": "PlayerEntry"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true,
                    "association": {
                        "connectionType": "HAS_MANY",
                        "associatedWith": [
                            "player"
                        ]
                    }
                },
                "playerResults": {
                    "name": "playerResults",
                    "isArray": true,
                    "type": {
                        "model": "PlayerResult"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true,
                    "association": {
                        "connectionType": "HAS_MANY",
                        "associatedWith": [
                            "player"
                        ]
                    }
                },
                "playerTickets": {
                    "name": "playerTickets",
                    "isArray": true,
                    "type": {
                        "model": "PlayerTicket"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true,
                    "association": {
                        "connectionType": "HAS_MANY",
                        "associatedWith": [
                            "player"
                        ]
                    }
                },
                "playerTransactions": {
                    "name": "playerTransactions",
                    "isArray": true,
                    "type": {
                        "model": "PlayerTransaction"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true,
                    "association": {
                        "connectionType": "HAS_MANY",
                        "associatedWith": [
                            "player"
                        ]
                    }
                },
                "playerCredits": {
                    "name": "playerCredits",
                    "isArray": true,
                    "type": {
                        "model": "PlayerCredits"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true,
                    "association": {
                        "connectionType": "HAS_MANY",
                        "associatedWith": [
                            "player"
                        ]
                    }
                },
                "playerPoints": {
                    "name": "playerPoints",
                    "isArray": true,
                    "type": {
                        "model": "PlayerPoints"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true,
                    "association": {
                        "connectionType": "HAS_MANY",
                        "associatedWith": [
                            "player"
                        ]
                    }
                },
                "venueAssignmentStatus": {
                    "name": "venueAssignmentStatus",
                    "isArray": false,
                    "type": {
                        "enum": "VenueAssignmentStatus"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "registrationVenueId": {
                    "name": "registrationVenueId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "registrationVenue": {
                    "name": "registrationVenue",
                    "isArray": false,
                    "type": {
                        "model": "Venue"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "association": {
                        "connectionType": "BELONGS_TO",
                        "targetNames": [
                            "registrationVenueId"
                        ]
                    }
                },
                "updatedAt": {
                    "name": "updatedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": true,
                    "attributes": []
                },
                "createdAt": {
                    "name": "createdAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                }
            },
            "syncable": true,
            "pluralName": "Players",
            "attributes": [
                {
                    "type": "model",
                    "properties": {}
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byPrimaryEntity",
                        "fields": [
                            "primaryEntityId"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byPhone",
                        "queryField": "playerByPhone",
                        "fields": [
                            "phone"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byEmail",
                        "queryField": "playerByEmail",
                        "fields": [
                            "email"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byRegistrationVenue",
                        "fields": [
                            "registrationVenueId"
                        ]
                    }
                },
                {
                    "type": "auth",
                    "properties": {
                        "rules": [
                            {
                                "allow": "private",
                                "operations": [
                                    "create",
                                    "update",
                                    "delete",
                                    "read"
                                ]
                            }
                        ]
                    }
                }
            ]
        },
        "PlayerSummary": {
            "name": "PlayerSummary",
            "fields": {
                "id": {
                    "name": "id",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "playerId": {
                    "name": "playerId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "gamesPlayedLast30Days": {
                    "name": "gamesPlayedLast30Days",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "gamesPlayedLast90Days": {
                    "name": "gamesPlayedLast90Days",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "gamesPlayedAllTime": {
                    "name": "gamesPlayedAllTime",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "averageFinishPosition": {
                    "name": "averageFinishPosition",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "netBalance": {
                    "name": "netBalance",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "player": {
                    "name": "player",
                    "isArray": false,
                    "type": {
                        "model": "Player"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "association": {
                        "connectionType": "BELONGS_TO",
                        "targetNames": [
                            "playerId"
                        ]
                    }
                },
                "sessionsPlayed": {
                    "name": "sessionsPlayed",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "tournamentsPlayed": {
                    "name": "tournamentsPlayed",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "cashGamesPlayed": {
                    "name": "cashGamesPlayed",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "venuesVisited": {
                    "name": "venuesVisited",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "tournamentWinnings": {
                    "name": "tournamentWinnings",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "tournamentBuyIns": {
                    "name": "tournamentBuyIns",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "tournamentITM": {
                    "name": "tournamentITM",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "tournamentsCashed": {
                    "name": "tournamentsCashed",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "cashGameWinnings": {
                    "name": "cashGameWinnings",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "cashGameBuyIns": {
                    "name": "cashGameBuyIns",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalWinnings": {
                    "name": "totalWinnings",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalBuyIns": {
                    "name": "totalBuyIns",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "lastPlayed": {
                    "name": "lastPlayed",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": true,
                    "attributes": []
                },
                "createdAt": {
                    "name": "createdAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                },
                "updatedAt": {
                    "name": "updatedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                }
            },
            "syncable": true,
            "pluralName": "PlayerSummaries",
            "attributes": [
                {
                    "type": "model",
                    "properties": {}
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byPlayer",
                        "fields": [
                            "playerId"
                        ]
                    }
                },
                {
                    "type": "auth",
                    "properties": {
                        "rules": [
                            {
                                "allow": "private",
                                "operations": [
                                    "create",
                                    "update",
                                    "delete",
                                    "read"
                                ]
                            }
                        ]
                    }
                }
            ]
        },
        "PlayerEntry": {
            "name": "PlayerEntry",
            "fields": {
                "id": {
                    "name": "id",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "playerId": {
                    "name": "playerId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "gameId": {
                    "name": "gameId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "venueId": {
                    "name": "venueId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "status": {
                    "name": "status",
                    "isArray": false,
                    "type": {
                        "enum": "PlayerEntryStatus"
                    },
                    "isRequired": true,
                    "attributes": []
                },
                "registrationTime": {
                    "name": "registrationTime",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": true,
                    "attributes": []
                },
                "eliminationTime": {
                    "name": "eliminationTime",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "gameStartDateTime": {
                    "name": "gameStartDateTime",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": true,
                    "attributes": []
                },
                "lastKnownStackSize": {
                    "name": "lastKnownStackSize",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "tableNumber": {
                    "name": "tableNumber",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "seatNumber": {
                    "name": "seatNumber",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "numberOfReEntries": {
                    "name": "numberOfReEntries",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "isMultiDayTournament": {
                    "name": "isMultiDayTournament",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "player": {
                    "name": "player",
                    "isArray": false,
                    "type": {
                        "model": "Player"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "association": {
                        "connectionType": "BELONGS_TO",
                        "targetNames": [
                            "playerId"
                        ]
                    }
                },
                "game": {
                    "name": "game",
                    "isArray": false,
                    "type": {
                        "model": "Game"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "association": {
                        "connectionType": "BELONGS_TO",
                        "targetNames": [
                            "gameId"
                        ]
                    }
                },
                "createdAt": {
                    "name": "createdAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                },
                "updatedAt": {
                    "name": "updatedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                }
            },
            "syncable": true,
            "pluralName": "PlayerEntries",
            "attributes": [
                {
                    "type": "model",
                    "properties": {}
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byPlayer",
                        "fields": [
                            "playerId",
                            "gameStartDateTime"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byGame",
                        "fields": [
                            "gameId"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byVenue",
                        "fields": [
                            "venueId"
                        ]
                    }
                },
                {
                    "type": "auth",
                    "properties": {
                        "rules": [
                            {
                                "allow": "private",
                                "operations": [
                                    "create",
                                    "update",
                                    "delete",
                                    "read"
                                ]
                            }
                        ]
                    }
                }
            ]
        },
        "PlayerResult": {
            "name": "PlayerResult",
            "fields": {
                "id": {
                    "name": "id",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "finishingPlace": {
                    "name": "finishingPlace",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "isMultiDayQualification": {
                    "name": "isMultiDayQualification",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "prizeWon": {
                    "name": "prizeWon",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "amountWon": {
                    "name": "amountWon",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalRunners": {
                    "name": "totalRunners",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "pointsEarned": {
                    "name": "pointsEarned",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "playerId": {
                    "name": "playerId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "player": {
                    "name": "player",
                    "isArray": false,
                    "type": {
                        "model": "Player"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "association": {
                        "connectionType": "BELONGS_TO",
                        "targetNames": [
                            "playerId"
                        ]
                    }
                },
                "gameId": {
                    "name": "gameId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "game": {
                    "name": "game",
                    "isArray": false,
                    "type": {
                        "model": "Game"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "association": {
                        "connectionType": "BELONGS_TO",
                        "targetNames": [
                            "gameId"
                        ]
                    }
                },
                "createdAt": {
                    "name": "createdAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                },
                "updatedAt": {
                    "name": "updatedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                }
            },
            "syncable": true,
            "pluralName": "PlayerResults",
            "attributes": [
                {
                    "type": "model",
                    "properties": {}
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byPlayer",
                        "fields": [
                            "playerId"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byGame",
                        "fields": [
                            "gameId"
                        ]
                    }
                },
                {
                    "type": "auth",
                    "properties": {
                        "rules": [
                            {
                                "allow": "private",
                                "operations": [
                                    "create",
                                    "update",
                                    "delete",
                                    "read"
                                ]
                            }
                        ]
                    }
                }
            ]
        },
        "PlayerVenue": {
            "name": "PlayerVenue",
            "fields": {
                "id": {
                    "name": "id",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "totalGamesPlayed": {
                    "name": "totalGamesPlayed",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "averageBuyIn": {
                    "name": "averageBuyIn",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "firstPlayedDate": {
                    "name": "firstPlayedDate",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "lastPlayedDate": {
                    "name": "lastPlayedDate",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "targetingClassification": {
                    "name": "targetingClassification",
                    "isArray": false,
                    "type": {
                        "enum": "PlayerVenueTargetingClassification"
                    },
                    "isRequired": true,
                    "attributes": []
                },
                "playerId": {
                    "name": "playerId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "player": {
                    "name": "player",
                    "isArray": false,
                    "type": {
                        "model": "Player"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "association": {
                        "connectionType": "BELONGS_TO",
                        "targetNames": [
                            "playerId"
                        ]
                    }
                },
                "venueId": {
                    "name": "venueId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "venue": {
                    "name": "venue",
                    "isArray": false,
                    "type": {
                        "model": "Venue"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "association": {
                        "connectionType": "BELONGS_TO",
                        "targetNames": [
                            "venueId"
                        ]
                    }
                },
                "createdAt": {
                    "name": "createdAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                },
                "updatedAt": {
                    "name": "updatedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                }
            },
            "syncable": true,
            "pluralName": "PlayerVenues",
            "attributes": [
                {
                    "type": "model",
                    "properties": {}
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byPlayer",
                        "fields": [
                            "playerId",
                            "venueId"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byVenue",
                        "fields": [
                            "venueId",
                            "playerId"
                        ]
                    }
                },
                {
                    "type": "auth",
                    "properties": {
                        "rules": [
                            {
                                "allow": "private",
                                "operations": [
                                    "create",
                                    "update",
                                    "delete",
                                    "read"
                                ]
                            }
                        ]
                    }
                }
            ]
        },
        "PlayerTransaction": {
            "name": "PlayerTransaction",
            "fields": {
                "id": {
                    "name": "id",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "type": {
                    "name": "type",
                    "isArray": false,
                    "type": {
                        "enum": "TransactionType"
                    },
                    "isRequired": true,
                    "attributes": []
                },
                "amount": {
                    "name": "amount",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": true,
                    "attributes": []
                },
                "rake": {
                    "name": "rake",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "paymentSource": {
                    "name": "paymentSource",
                    "isArray": false,
                    "type": {
                        "enum": "PaymentSourceType"
                    },
                    "isRequired": true,
                    "attributes": []
                },
                "transactionDate": {
                    "name": "transactionDate",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": true,
                    "attributes": []
                },
                "notes": {
                    "name": "notes",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "playerId": {
                    "name": "playerId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "player": {
                    "name": "player",
                    "isArray": false,
                    "type": {
                        "model": "Player"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "association": {
                        "connectionType": "BELONGS_TO",
                        "targetNames": [
                            "playerId"
                        ]
                    }
                },
                "gameId": {
                    "name": "gameId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "createdAt": {
                    "name": "createdAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                },
                "updatedAt": {
                    "name": "updatedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                }
            },
            "syncable": true,
            "pluralName": "PlayerTransactions",
            "attributes": [
                {
                    "type": "model",
                    "properties": {}
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byPlayer",
                        "fields": [
                            "playerId",
                            "transactionDate"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byGame",
                        "fields": [
                            "gameId"
                        ]
                    }
                },
                {
                    "type": "auth",
                    "properties": {
                        "rules": [
                            {
                                "allow": "private",
                                "operations": [
                                    "create",
                                    "update",
                                    "delete",
                                    "read"
                                ]
                            }
                        ]
                    }
                }
            ]
        },
        "PlayerCredits": {
            "name": "PlayerCredits",
            "fields": {
                "id": {
                    "name": "id",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "type": {
                    "name": "type",
                    "isArray": false,
                    "type": {
                        "enum": "CreditTransactionType"
                    },
                    "isRequired": true,
                    "attributes": []
                },
                "changeAmount": {
                    "name": "changeAmount",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": true,
                    "attributes": []
                },
                "balanceAfter": {
                    "name": "balanceAfter",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": true,
                    "attributes": []
                },
                "transactionDate": {
                    "name": "transactionDate",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": true,
                    "attributes": []
                },
                "reason": {
                    "name": "reason",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "expiryDate": {
                    "name": "expiryDate",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "playerId": {
                    "name": "playerId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "player": {
                    "name": "player",
                    "isArray": false,
                    "type": {
                        "model": "Player"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "association": {
                        "connectionType": "BELONGS_TO",
                        "targetNames": [
                            "playerId"
                        ]
                    }
                },
                "relatedGameId": {
                    "name": "relatedGameId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "relatedTransactionId": {
                    "name": "relatedTransactionId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "createdAt": {
                    "name": "createdAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                },
                "updatedAt": {
                    "name": "updatedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                }
            },
            "syncable": true,
            "pluralName": "PlayerCredits",
            "attributes": [
                {
                    "type": "model",
                    "properties": {}
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byPlayer",
                        "fields": [
                            "playerId",
                            "transactionDate"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byGame",
                        "fields": [
                            "relatedGameId"
                        ]
                    }
                },
                {
                    "type": "auth",
                    "properties": {
                        "rules": [
                            {
                                "allow": "private",
                                "operations": [
                                    "create",
                                    "update",
                                    "delete",
                                    "read"
                                ]
                            }
                        ]
                    }
                }
            ]
        },
        "PlayerPoints": {
            "name": "PlayerPoints",
            "fields": {
                "id": {
                    "name": "id",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "type": {
                    "name": "type",
                    "isArray": false,
                    "type": {
                        "enum": "PointsTransactionType"
                    },
                    "isRequired": true,
                    "attributes": []
                },
                "changeAmount": {
                    "name": "changeAmount",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": true,
                    "attributes": []
                },
                "balanceAfter": {
                    "name": "balanceAfter",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": true,
                    "attributes": []
                },
                "transactionDate": {
                    "name": "transactionDate",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": true,
                    "attributes": []
                },
                "reason": {
                    "name": "reason",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "expiryDate": {
                    "name": "expiryDate",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "playerId": {
                    "name": "playerId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "player": {
                    "name": "player",
                    "isArray": false,
                    "type": {
                        "model": "Player"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "association": {
                        "connectionType": "BELONGS_TO",
                        "targetNames": [
                            "playerId"
                        ]
                    }
                },
                "relatedGameId": {
                    "name": "relatedGameId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "relatedTransactionId": {
                    "name": "relatedTransactionId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "createdAt": {
                    "name": "createdAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                },
                "updatedAt": {
                    "name": "updatedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                }
            },
            "syncable": true,
            "pluralName": "PlayerPoints",
            "attributes": [
                {
                    "type": "model",
                    "properties": {}
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byPlayer",
                        "fields": [
                            "playerId",
                            "transactionDate"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byGame",
                        "fields": [
                            "relatedGameId"
                        ]
                    }
                },
                {
                    "type": "auth",
                    "properties": {
                        "rules": [
                            {
                                "allow": "private",
                                "operations": [
                                    "create",
                                    "update",
                                    "delete",
                                    "read"
                                ]
                            }
                        ]
                    }
                }
            ]
        },
        "KnownPlayerIdentity": {
            "name": "KnownPlayerIdentity",
            "fields": {
                "id": {
                    "name": "id",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "sourceSystem": {
                    "name": "sourceSystem",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "identityValue": {
                    "name": "identityValue",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "identityType": {
                    "name": "identityType",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "playerId": {
                    "name": "playerId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "player": {
                    "name": "player",
                    "isArray": false,
                    "type": {
                        "model": "Player"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "association": {
                        "connectionType": "BELONGS_TO",
                        "targetNames": [
                            "playerId"
                        ]
                    }
                },
                "createdAt": {
                    "name": "createdAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                },
                "updatedAt": {
                    "name": "updatedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                }
            },
            "syncable": true,
            "pluralName": "KnownPlayerIdentities",
            "attributes": [
                {
                    "type": "model",
                    "properties": {}
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byPlayer",
                        "fields": [
                            "playerId"
                        ]
                    }
                },
                {
                    "type": "auth",
                    "properties": {
                        "rules": [
                            {
                                "allow": "private",
                                "operations": [
                                    "create",
                                    "update",
                                    "delete",
                                    "read"
                                ]
                            }
                        ]
                    }
                }
            ]
        },
        "TicketTemplate": {
            "name": "TicketTemplate",
            "fields": {
                "id": {
                    "name": "id",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "name": {
                    "name": "name",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "description": {
                    "name": "description",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "value": {
                    "name": "value",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": true,
                    "attributes": []
                },
                "validityDays": {
                    "name": "validityDays",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "originGameId": {
                    "name": "originGameId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "targetGameId": {
                    "name": "targetGameId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "playerTickets": {
                    "name": "playerTickets",
                    "isArray": true,
                    "type": {
                        "model": "PlayerTicket"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true,
                    "association": {
                        "connectionType": "HAS_MANY",
                        "associatedWith": [
                            "ticketTemplate"
                        ]
                    }
                },
                "createdAt": {
                    "name": "createdAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                },
                "updatedAt": {
                    "name": "updatedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                }
            },
            "syncable": true,
            "pluralName": "TicketTemplates",
            "attributes": [
                {
                    "type": "model",
                    "properties": {}
                },
                {
                    "type": "auth",
                    "properties": {
                        "rules": [
                            {
                                "allow": "private",
                                "operations": [
                                    "create",
                                    "update",
                                    "delete",
                                    "read"
                                ]
                            }
                        ]
                    }
                }
            ]
        },
        "PlayerTicket": {
            "name": "PlayerTicket",
            "fields": {
                "id": {
                    "name": "id",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "assignedAt": {
                    "name": "assignedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": true,
                    "attributes": []
                },
                "expiryDate": {
                    "name": "expiryDate",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": true,
                    "attributes": []
                },
                "status": {
                    "name": "status",
                    "isArray": false,
                    "type": {
                        "enum": "TicketStatus"
                    },
                    "isRequired": true,
                    "attributes": []
                },
                "usedInGameId": {
                    "name": "usedInGameId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "playerId": {
                    "name": "playerId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "player": {
                    "name": "player",
                    "isArray": false,
                    "type": {
                        "model": "Player"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "association": {
                        "connectionType": "BELONGS_TO",
                        "targetNames": [
                            "playerId"
                        ]
                    }
                },
                "ticketTemplateId": {
                    "name": "ticketTemplateId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "ticketTemplate": {
                    "name": "ticketTemplate",
                    "isArray": false,
                    "type": {
                        "model": "TicketTemplate"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "association": {
                        "connectionType": "BELONGS_TO",
                        "targetNames": [
                            "ticketTemplateId"
                        ]
                    }
                },
                "createdAt": {
                    "name": "createdAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                },
                "updatedAt": {
                    "name": "updatedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                }
            },
            "syncable": true,
            "pluralName": "PlayerTickets",
            "attributes": [
                {
                    "type": "model",
                    "properties": {}
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byPlayer",
                        "fields": [
                            "playerId"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byTicketTemplate",
                        "fields": [
                            "ticketTemplateId"
                        ]
                    }
                },
                {
                    "type": "auth",
                    "properties": {
                        "rules": [
                            {
                                "allow": "private",
                                "operations": [
                                    "create",
                                    "update",
                                    "delete",
                                    "read"
                                ]
                            }
                        ]
                    }
                }
            ]
        },
        "MarketingMessage": {
            "name": "MarketingMessage",
            "fields": {
                "id": {
                    "name": "id",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "name": {
                    "name": "name",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "subject": {
                    "name": "subject",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "emailBody": {
                    "name": "emailBody",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "smsBody": {
                    "name": "smsBody",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "sentMessages": {
                    "name": "sentMessages",
                    "isArray": true,
                    "type": {
                        "model": "PlayerMarketingMessage"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true,
                    "association": {
                        "connectionType": "HAS_MANY",
                        "associatedWith": [
                            "marketingMessageId"
                        ]
                    }
                },
                "createdAt": {
                    "name": "createdAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                },
                "updatedAt": {
                    "name": "updatedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                }
            },
            "syncable": true,
            "pluralName": "MarketingMessages",
            "attributes": [
                {
                    "type": "model",
                    "properties": {}
                },
                {
                    "type": "auth",
                    "properties": {
                        "rules": [
                            {
                                "allow": "private",
                                "operations": [
                                    "create",
                                    "update",
                                    "delete",
                                    "read"
                                ]
                            }
                        ]
                    }
                }
            ]
        },
        "PlayerMarketingMessage": {
            "name": "PlayerMarketingMessage",
            "fields": {
                "id": {
                    "name": "id",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "status": {
                    "name": "status",
                    "isArray": false,
                    "type": {
                        "enum": "MessageStatus"
                    },
                    "isRequired": true,
                    "attributes": []
                },
                "sentAt": {
                    "name": "sentAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": true,
                    "attributes": []
                },
                "playerId": {
                    "name": "playerId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "marketingMessageId": {
                    "name": "marketingMessageId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "createdAt": {
                    "name": "createdAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                },
                "updatedAt": {
                    "name": "updatedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                }
            },
            "syncable": true,
            "pluralName": "PlayerMarketingMessages",
            "attributes": [
                {
                    "type": "model",
                    "properties": {}
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byPlayer",
                        "fields": [
                            "playerId",
                            "sentAt"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byMarketingMessage",
                        "fields": [
                            "marketingMessageId"
                        ]
                    }
                },
                {
                    "type": "auth",
                    "properties": {
                        "rules": [
                            {
                                "allow": "private",
                                "operations": [
                                    "create",
                                    "update",
                                    "delete",
                                    "read"
                                ]
                            }
                        ]
                    }
                }
            ]
        },
        "PlayerMarketingPreferences": {
            "name": "PlayerMarketingPreferences",
            "fields": {
                "id": {
                    "name": "id",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "optOutSms": {
                    "name": "optOutSms",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "optOutEmail": {
                    "name": "optOutEmail",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "playerId": {
                    "name": "playerId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "player": {
                    "name": "player",
                    "isArray": false,
                    "type": {
                        "model": "Player"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "association": {
                        "connectionType": "BELONGS_TO",
                        "targetNames": [
                            "playerId"
                        ]
                    }
                },
                "createdAt": {
                    "name": "createdAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                },
                "updatedAt": {
                    "name": "updatedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                }
            },
            "syncable": true,
            "pluralName": "PlayerMarketingPreferences",
            "attributes": [
                {
                    "type": "model",
                    "properties": {}
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byPlayer",
                        "fields": [
                            "playerId"
                        ]
                    }
                },
                {
                    "type": "auth",
                    "properties": {
                        "rules": [
                            {
                                "allow": "private",
                                "operations": [
                                    "create",
                                    "update",
                                    "delete",
                                    "read"
                                ]
                            }
                        ]
                    }
                }
            ]
        },
        "User": {
            "name": "User",
            "fields": {
                "id": {
                    "name": "id",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "username": {
                    "name": "username",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "email": {
                    "name": "email",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "role": {
                    "name": "role",
                    "isArray": false,
                    "type": {
                        "enum": "UserRole"
                    },
                    "isRequired": true,
                    "attributes": []
                },
                "preferences": {
                    "name": "preferences",
                    "isArray": true,
                    "type": {
                        "model": "UserPreference"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true,
                    "association": {
                        "connectionType": "HAS_MANY",
                        "associatedWith": [
                            "userId"
                        ]
                    }
                },
                "createdAt": {
                    "name": "createdAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                },
                "updatedAt": {
                    "name": "updatedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                }
            },
            "syncable": true,
            "pluralName": "Users",
            "attributes": [
                {
                    "type": "model",
                    "properties": {}
                },
                {
                    "type": "auth",
                    "properties": {
                        "rules": [
                            {
                                "provider": "userPools",
                                "ownerField": "id",
                                "allow": "owner",
                                "operations": [
                                    "read",
                                    "update"
                                ],
                                "identityClaim": "cognito:username"
                            },
                            {
                                "allow": "private",
                                "operations": [
                                    "create",
                                    "read"
                                ]
                            },
                            {
                                "groupClaim": "cognito:groups",
                                "provider": "userPools",
                                "allow": "groups",
                                "groups": [
                                    "SUPER_ADMIN"
                                ],
                                "operations": [
                                    "create",
                                    "read",
                                    "update",
                                    "delete"
                                ]
                            }
                        ]
                    }
                }
            ]
        },
        "UserPreference": {
            "name": "UserPreference",
            "fields": {
                "id": {
                    "name": "id",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "page": {
                    "name": "page",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "widget": {
                    "name": "widget",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "preference": {
                    "name": "preference",
                    "isArray": false,
                    "type": "AWSJSON",
                    "isRequired": false,
                    "attributes": []
                },
                "userId": {
                    "name": "userId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "createdAt": {
                    "name": "createdAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                },
                "updatedAt": {
                    "name": "updatedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                }
            },
            "syncable": true,
            "pluralName": "UserPreferences",
            "attributes": [
                {
                    "type": "model",
                    "properties": {}
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byUser",
                        "fields": [
                            "userId"
                        ]
                    }
                },
                {
                    "type": "auth",
                    "properties": {
                        "rules": [
                            {
                                "provider": "userPools",
                                "ownerField": "userId",
                                "allow": "owner",
                                "identityClaim": "cognito:username",
                                "operations": [
                                    "create",
                                    "update",
                                    "delete",
                                    "read"
                                ]
                            }
                        ]
                    }
                }
            ]
        },
        "Staff": {
            "name": "Staff",
            "fields": {
                "id": {
                    "name": "id",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "firstName": {
                    "name": "firstName",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "lastName": {
                    "name": "lastName",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "role": {
                    "name": "role",
                    "isArray": false,
                    "type": {
                        "enum": "StaffRole"
                    },
                    "isRequired": true,
                    "attributes": []
                },
                "assignedVenueId": {
                    "name": "assignedVenueId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "createdAt": {
                    "name": "createdAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                },
                "updatedAt": {
                    "name": "updatedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                }
            },
            "syncable": true,
            "pluralName": "Staff",
            "attributes": [
                {
                    "type": "model",
                    "properties": {}
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byVenue",
                        "fields": [
                            "assignedVenueId"
                        ]
                    }
                },
                {
                    "type": "auth",
                    "properties": {
                        "rules": [
                            {
                                "allow": "private",
                                "operations": [
                                    "create",
                                    "update",
                                    "delete",
                                    "read"
                                ]
                            }
                        ]
                    }
                }
            ]
        },
        "Asset": {
            "name": "Asset",
            "fields": {
                "id": {
                    "name": "id",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "name": {
                    "name": "name",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "type": {
                    "name": "type",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "condition": {
                    "name": "condition",
                    "isArray": false,
                    "type": {
                        "enum": "AssetCondition"
                    },
                    "isRequired": true,
                    "attributes": []
                },
                "acquiredDate": {
                    "name": "acquiredDate",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": true,
                    "attributes": []
                },
                "lastCheckedDate": {
                    "name": "lastCheckedDate",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": true,
                    "attributes": []
                },
                "venueId": {
                    "name": "venueId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "venue": {
                    "name": "venue",
                    "isArray": false,
                    "type": {
                        "model": "Venue"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "association": {
                        "connectionType": "BELONGS_TO",
                        "targetNames": [
                            "venueId"
                        ]
                    }
                },
                "entityId": {
                    "name": "entityId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "entity": {
                    "name": "entity",
                    "isArray": false,
                    "type": {
                        "model": "Entity"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "association": {
                        "connectionType": "BELONGS_TO",
                        "targetNames": [
                            "entityId"
                        ]
                    }
                },
                "createdAt": {
                    "name": "createdAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                },
                "updatedAt": {
                    "name": "updatedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                }
            },
            "syncable": true,
            "pluralName": "Assets",
            "attributes": [
                {
                    "type": "model",
                    "properties": {}
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byVenue",
                        "fields": [
                            "venueId"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byEntityAsset",
                        "fields": [
                            "entityId",
                            "type"
                        ]
                    }
                },
                {
                    "type": "auth",
                    "properties": {
                        "rules": [
                            {
                                "allow": "private",
                                "operations": [
                                    "create",
                                    "update",
                                    "delete",
                                    "read"
                                ]
                            }
                        ]
                    }
                }
            ]
        },
        "SocialAccount": {
            "name": "SocialAccount",
            "fields": {
                "id": {
                    "name": "id",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "platform": {
                    "name": "platform",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "accountName": {
                    "name": "accountName",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "apiKey": {
                    "name": "apiKey",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "apiSecret": {
                    "name": "apiSecret",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "createdAt": {
                    "name": "createdAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                },
                "updatedAt": {
                    "name": "updatedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                }
            },
            "syncable": true,
            "pluralName": "SocialAccounts",
            "attributes": [
                {
                    "type": "model",
                    "properties": {}
                },
                {
                    "type": "auth",
                    "properties": {
                        "rules": [
                            {
                                "allow": "private",
                                "operations": [
                                    "create",
                                    "update",
                                    "delete",
                                    "read"
                                ]
                            }
                        ]
                    }
                }
            ]
        },
        "SocialPost": {
            "name": "SocialPost",
            "fields": {
                "id": {
                    "name": "id",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "content": {
                    "name": "content",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "imageUrl": {
                    "name": "imageUrl",
                    "isArray": false,
                    "type": "AWSURL",
                    "isRequired": false,
                    "attributes": []
                },
                "postedAt": {
                    "name": "postedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": true,
                    "attributes": []
                },
                "socialAccountId": {
                    "name": "socialAccountId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "createdAt": {
                    "name": "createdAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                },
                "updatedAt": {
                    "name": "updatedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                }
            },
            "syncable": true,
            "pluralName": "SocialPosts",
            "attributes": [
                {
                    "type": "model",
                    "properties": {}
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "bySocialAccount",
                        "fields": [
                            "socialAccountId",
                            "postedAt"
                        ]
                    }
                },
                {
                    "type": "auth",
                    "properties": {
                        "rules": [
                            {
                                "allow": "private",
                                "operations": [
                                    "create",
                                    "update",
                                    "delete",
                                    "read"
                                ]
                            }
                        ]
                    }
                }
            ]
        },
        "ScraperJob": {
            "name": "ScraperJob",
            "fields": {
                "id": {
                    "name": "id",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "jobId": {
                    "name": "jobId",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "triggerSource": {
                    "name": "triggerSource",
                    "isArray": false,
                    "type": {
                        "enum": "ScraperJobTriggerSource"
                    },
                    "isRequired": true,
                    "attributes": []
                },
                "triggeredBy": {
                    "name": "triggeredBy",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "startTime": {
                    "name": "startTime",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": true,
                    "attributes": []
                },
                "endTime": {
                    "name": "endTime",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "durationSeconds": {
                    "name": "durationSeconds",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "maxGames": {
                    "name": "maxGames",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "targetURLs": {
                    "name": "targetURLs",
                    "isArray": true,
                    "type": "String",
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "isFullScan": {
                    "name": "isFullScan",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "startId": {
                    "name": "startId",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "endId": {
                    "name": "endId",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "status": {
                    "name": "status",
                    "isArray": false,
                    "type": {
                        "enum": "ScraperJobStatus"
                    },
                    "isRequired": true,
                    "attributes": []
                },
                "totalURLsProcessed": {
                    "name": "totalURLsProcessed",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "newGamesScraped": {
                    "name": "newGamesScraped",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "gamesUpdated": {
                    "name": "gamesUpdated",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "gamesSkipped": {
                    "name": "gamesSkipped",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "errors": {
                    "name": "errors",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "blanks": {
                    "name": "blanks",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "averageScrapingTime": {
                    "name": "averageScrapingTime",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "successRate": {
                    "name": "successRate",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "errorMessages": {
                    "name": "errorMessages",
                    "isArray": true,
                    "type": "String",
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "failedURLs": {
                    "name": "failedURLs",
                    "isArray": true,
                    "type": "String",
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "urlResults": {
                    "name": "urlResults",
                    "isArray": true,
                    "type": {
                        "nonModel": "ScraperJobURLResult"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "scrapeAttempts": {
                    "name": "scrapeAttempts",
                    "isArray": true,
                    "type": {
                        "model": "ScrapeAttempt"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true,
                    "association": {
                        "connectionType": "HAS_MANY",
                        "associatedWith": [
                            "scraperJob"
                        ]
                    }
                },
                "entityId": {
                    "name": "entityId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "entity": {
                    "name": "entity",
                    "isArray": false,
                    "type": {
                        "model": "Entity"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "association": {
                        "connectionType": "BELONGS_TO",
                        "targetNames": [
                            "entityId"
                        ]
                    }
                },
                "createdAt": {
                    "name": "createdAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": true,
                    "attributes": []
                },
                "updatedAt": {
                    "name": "updatedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": true,
                    "attributes": []
                }
            },
            "syncable": true,
            "pluralName": "ScraperJobs",
            "attributes": [
                {
                    "type": "model",
                    "properties": {
                        "queries": {
                            "list": null
                        }
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byJobId",
                        "fields": [
                            "jobId"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byStatus",
                        "fields": [
                            "status",
                            "startTime"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byEntityScraperJob",
                        "fields": [
                            "entityId",
                            "startTime"
                        ]
                    }
                },
                {
                    "type": "auth",
                    "properties": {
                        "rules": [
                            {
                                "allow": "private",
                                "operations": [
                                    "create",
                                    "update",
                                    "delete",
                                    "read"
                                ]
                            }
                        ]
                    }
                }
            ]
        },
        "ScrapeURL": {
            "name": "ScrapeURL",
            "fields": {
                "id": {
                    "name": "id",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "url": {
                    "name": "url",
                    "isArray": false,
                    "type": "AWSURL",
                    "isRequired": true,
                    "attributes": []
                },
                "tournamentId": {
                    "name": "tournamentId",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "doNotScrape": {
                    "name": "doNotScrape",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": true,
                    "attributes": []
                },
                "sourceDataIssue": {
                    "name": "sourceDataIssue",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "gameDataVerified": {
                    "name": "gameDataVerified",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "missingKeysFromScrape": {
                    "name": "missingKeysFromScrape",
                    "isArray": true,
                    "type": "String",
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "sourceSystem": {
                    "name": "sourceSystem",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "status": {
                    "name": "status",
                    "isArray": false,
                    "type": {
                        "enum": "ScrapeURLStatus"
                    },
                    "isRequired": true,
                    "attributes": []
                },
                "placedIntoDatabase": {
                    "name": "placedIntoDatabase",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": true,
                    "attributes": []
                },
                "firstScrapedAt": {
                    "name": "firstScrapedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": true,
                    "attributes": []
                },
                "lastScrapedAt": {
                    "name": "lastScrapedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": true,
                    "attributes": []
                },
                "lastSuccessfulScrapeAt": {
                    "name": "lastSuccessfulScrapeAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "timesScraped": {
                    "name": "timesScraped",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "timesSuccessful": {
                    "name": "timesSuccessful",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "timesFailed": {
                    "name": "timesFailed",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "consecutiveFailures": {
                    "name": "consecutiveFailures",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "lastScrapeStatus": {
                    "name": "lastScrapeStatus",
                    "isArray": false,
                    "type": {
                        "enum": "ScrapeAttemptStatus"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "lastScrapeMessage": {
                    "name": "lastScrapeMessage",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "lastScrapeJobId": {
                    "name": "lastScrapeJobId",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "gameId": {
                    "name": "gameId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "gameName": {
                    "name": "gameName",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "gameStatus": {
                    "name": "gameStatus",
                    "isArray": false,
                    "type": {
                        "enum": "GameStatus"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "venueId": {
                    "name": "venueId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "venueName": {
                    "name": "venueName",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "lastDataHash": {
                    "name": "lastDataHash",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "hasDataChanges": {
                    "name": "hasDataChanges",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "lastFoundKeys": {
                    "name": "lastFoundKeys",
                    "isArray": true,
                    "type": "String",
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "lastStructureLabel": {
                    "name": "lastStructureLabel",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "averageScrapingTime": {
                    "name": "averageScrapingTime",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "lastScrapingTime": {
                    "name": "lastScrapingTime",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "attempts": {
                    "name": "attempts",
                    "isArray": true,
                    "type": {
                        "model": "ScrapeAttempt"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true,
                    "association": {
                        "connectionType": "HAS_MANY",
                        "associatedWith": [
                            "scrapeURL"
                        ]
                    }
                },
                "entityId": {
                    "name": "entityId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "entity": {
                    "name": "entity",
                    "isArray": false,
                    "type": {
                        "model": "Entity"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "association": {
                        "connectionType": "BELONGS_TO",
                        "targetNames": [
                            "entityId"
                        ]
                    }
                },
                "createdAt": {
                    "name": "createdAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": true,
                    "attributes": []
                },
                "updatedAt": {
                    "name": "updatedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": true,
                    "attributes": []
                },
                "etag": {
                    "name": "etag",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "lastModifiedHeader": {
                    "name": "lastModifiedHeader",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "contentHash": {
                    "name": "contentHash",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "s3StoragePrefix": {
                    "name": "s3StoragePrefix",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "latestS3Key": {
                    "name": "latestS3Key",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "s3StorageEnabled": {
                    "name": "s3StorageEnabled",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "lastContentChangeAt": {
                    "name": "lastContentChangeAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "totalContentChanges": {
                    "name": "totalContentChanges",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "lastHeaderCheckAt": {
                    "name": "lastHeaderCheckAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "cachedContentUsedCount": {
                    "name": "cachedContentUsedCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "lastCacheHitAt": {
                    "name": "lastCacheHitAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "contentSize": {
                    "name": "contentSize",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                }
            },
            "syncable": true,
            "pluralName": "ScrapeURLS",
            "attributes": [
                {
                    "type": "model",
                    "properties": {
                        "queries": {
                            "get": "getScrapeURL",
                            "list": null
                        }
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byURL",
                        "queryField": "scrapeURLByURL",
                        "fields": [
                            "url"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byTournamentId",
                        "fields": [
                            "tournamentId"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "bySourceSystem",
                        "queryField": "scrapeURLsBySourceSystem",
                        "fields": [
                            "sourceSystem",
                            "tournamentId"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byGameId",
                        "fields": [
                            "gameId"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byEntityScrapeURL",
                        "fields": [
                            "entityId"
                        ]
                    }
                },
                {
                    "type": "auth",
                    "properties": {
                        "rules": [
                            {
                                "allow": "private",
                                "operations": [
                                    "create",
                                    "update",
                                    "delete",
                                    "read"
                                ]
                            }
                        ]
                    }
                }
            ]
        },
        "ScrapeAttempt": {
            "name": "ScrapeAttempt",
            "fields": {
                "id": {
                    "name": "id",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "url": {
                    "name": "url",
                    "isArray": false,
                    "type": "AWSURL",
                    "isRequired": true,
                    "attributes": []
                },
                "tournamentId": {
                    "name": "tournamentId",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "attemptTime": {
                    "name": "attemptTime",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": true,
                    "attributes": []
                },
                "scraperJobId": {
                    "name": "scraperJobId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "scraperJob": {
                    "name": "scraperJob",
                    "isArray": false,
                    "type": {
                        "model": "ScraperJob"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "association": {
                        "connectionType": "BELONGS_TO",
                        "targetNames": [
                            "scraperJobId"
                        ]
                    }
                },
                "scrapeURLId": {
                    "name": "scrapeURLId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "scrapeURL": {
                    "name": "scrapeURL",
                    "isArray": false,
                    "type": {
                        "model": "ScrapeURL"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "association": {
                        "connectionType": "BELONGS_TO",
                        "targetNames": [
                            "scrapeURLId"
                        ]
                    }
                },
                "status": {
                    "name": "status",
                    "isArray": false,
                    "type": {
                        "enum": "ScrapeAttemptStatus"
                    },
                    "isRequired": true,
                    "attributes": []
                },
                "processingTime": {
                    "name": "processingTime",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "gameName": {
                    "name": "gameName",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "gameStatus": {
                    "name": "gameStatus",
                    "isArray": false,
                    "type": {
                        "enum": "GameStatus"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "registrationStatus": {
                    "name": "registrationStatus",
                    "isArray": false,
                    "type": {
                        "enum": "RegistrationStatus"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "dataHash": {
                    "name": "dataHash",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "hasChanges": {
                    "name": "hasChanges",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "errorMessage": {
                    "name": "errorMessage",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "errorType": {
                    "name": "errorType",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "gameId": {
                    "name": "gameId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "wasNewGame": {
                    "name": "wasNewGame",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "fieldsUpdated": {
                    "name": "fieldsUpdated",
                    "isArray": true,
                    "type": "String",
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "foundKeys": {
                    "name": "foundKeys",
                    "isArray": true,
                    "type": "String",
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "structureLabel": {
                    "name": "structureLabel",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "createdAt": {
                    "name": "createdAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": true,
                    "attributes": []
                },
                "updatedAt": {
                    "name": "updatedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": true,
                    "attributes": []
                }
            },
            "syncable": true,
            "pluralName": "ScrapeAttempts",
            "attributes": [
                {
                    "type": "model",
                    "properties": {}
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byScraperJob",
                        "fields": [
                            "scraperJobId",
                            "attemptTime"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byScrapeURL",
                        "fields": [
                            "scrapeURLId",
                            "attemptTime"
                        ]
                    }
                },
                {
                    "type": "auth",
                    "properties": {
                        "rules": [
                            {
                                "allow": "private",
                                "operations": [
                                    "create",
                                    "update",
                                    "delete",
                                    "read"
                                ]
                            }
                        ]
                    }
                }
            ]
        },
        "S3Storage": {
            "name": "S3Storage",
            "fields": {
                "id": {
                    "name": "id",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "scrapeURLId": {
                    "name": "scrapeURLId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "url": {
                    "name": "url",
                    "isArray": false,
                    "type": "AWSURL",
                    "isRequired": true,
                    "attributes": []
                },
                "tournamentId": {
                    "name": "tournamentId",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "entityId": {
                    "name": "entityId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "s3Key": {
                    "name": "s3Key",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "s3Bucket": {
                    "name": "s3Bucket",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "scrapedAt": {
                    "name": "scrapedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": true,
                    "attributes": []
                },
                "contentSize": {
                    "name": "contentSize",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "contentHash": {
                    "name": "contentHash",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "etag": {
                    "name": "etag",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "lastModified": {
                    "name": "lastModified",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "headers": {
                    "name": "headers",
                    "isArray": false,
                    "type": "AWSJSON",
                    "isRequired": false,
                    "attributes": []
                },
                "dataExtracted": {
                    "name": "dataExtracted",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "gameId": {
                    "name": "gameId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "isManualUpload": {
                    "name": "isManualUpload",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "uploadedBy": {
                    "name": "uploadedBy",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "notes": {
                    "name": "notes",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "previousVersions": {
                    "name": "previousVersions",
                    "isArray": true,
                    "type": {
                        "nonModel": "S3VersionHistory"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "gameStatus": {
                    "name": "gameStatus",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "registrationStatus": {
                    "name": "registrationStatus",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "createdAt": {
                    "name": "createdAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": true,
                    "attributes": []
                },
                "updatedAt": {
                    "name": "updatedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": true,
                    "attributes": []
                }
            },
            "syncable": true,
            "pluralName": "S3Storages",
            "attributes": [
                {
                    "type": "model",
                    "properties": {}
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byScrapeURL",
                        "fields": [
                            "scrapeURLId",
                            "scrapedAt"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byURL",
                        "fields": [
                            "url",
                            "scrapedAt"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byTournamentId",
                        "fields": [
                            "tournamentId",
                            "scrapedAt"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byEntity",
                        "fields": [
                            "entityId",
                            "scrapedAt"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byS3Key",
                        "fields": [
                            "s3Key"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byGameId",
                        "fields": [
                            "gameId"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byS3GameStatus",
                        "queryField": "s3StorageByGameStatus",
                        "fields": [
                            "gameStatus",
                            "scrapedAt"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byS3RegistrationStatus",
                        "queryField": "s3StorageByRegistrationStatus",
                        "fields": [
                            "registrationStatus",
                            "scrapedAt"
                        ]
                    }
                },
                {
                    "type": "auth",
                    "properties": {
                        "rules": [
                            {
                                "allow": "private",
                                "operations": [
                                    "create",
                                    "update",
                                    "delete",
                                    "read"
                                ]
                            }
                        ]
                    }
                }
            ]
        }
    },
    "enums": {
        "DataSource": {
            "name": "DataSource",
            "values": [
                "SCRAPE",
                "API",
                "MANUAL"
            ]
        },
        "AssetCondition": {
            "name": "AssetCondition",
            "values": [
                "NEW",
                "GOOD",
                "FAIR",
                "POOR",
                "RETIRED"
            ]
        },
        "VenueStatus": {
            "name": "VenueStatus",
            "values": [
                "ACTIVE",
                "INACTIVE",
                "PENDING"
            ]
        },
        "GameType": {
            "name": "GameType",
            "values": [
                "TOURNAMENT",
                "CASH_GAME"
            ]
        },
        "GameStatus": {
            "name": "GameStatus",
            "values": [
                "INITIATING",
                "SCHEDULED",
                "REGISTERING",
                "RUNNING",
                "CANCELLED",
                "FINISHED",
                "NOT_IN_USE",
                "NOT_PUBLISHED",
                "CLOCK_STOPPED",
                "UNKNOWN"
            ]
        },
        "GameVariant": {
            "name": "GameVariant",
            "values": [
                "NLHE",
                "PLO",
                "PLOM",
                "PLO5",
                "PLO6"
            ]
        },
        "GameFrequency": {
            "name": "GameFrequency",
            "values": [
                "DAILY",
                "WEEKLY",
                "FORTNIGHTLY",
                "MONTHLY",
                "QUARTERLY",
                "YEARLY",
                "UNKNOWN"
            ]
        },
        "RegistrationStatus": {
            "name": "RegistrationStatus",
            "values": [
                "SCHEDULED",
                "OPEN",
                "FINAL",
                "CLOSED",
                "N_A"
            ]
        },
        "TournamentType": {
            "name": "TournamentType",
            "values": [
                "FREEZEOUT",
                "REBUY",
                "SATELLITE",
                "DEEPSTACK"
            ]
        },
        "PaymentSourceType": {
            "name": "PaymentSourceType",
            "values": [
                "CASH",
                "SQUARE",
                "CREDIT_CARD",
                "INTERNAL_CREDIT",
                "UNKNOWN"
            ]
        },
        "PlayerAccountStatus": {
            "name": "PlayerAccountStatus",
            "values": [
                "ACTIVE",
                "SUSPENDED",
                "PENDING_VERIFICATION"
            ]
        },
        "PlayerAccountCategory": {
            "name": "PlayerAccountCategory",
            "values": [
                "NEW",
                "RECREATIONAL",
                "REGULAR",
                "VIP",
                "LAPSED"
            ]
        },
        "SeriesStatus": {
            "name": "SeriesStatus",
            "values": [
                "LIVE",
                "SCHEDULED",
                "COMPLETED"
            ]
        },
        "PlayerTargetingClassification": {
            "name": "PlayerTargetingClassification",
            "values": [
                "NotPlayed",
                "Active_EL",
                "Active",
                "Retain_Inactive31_60d",
                "Retain_Inactive61_90d",
                "Churned_91_120d",
                "Churned_121_180d",
                "Churned_181_360d",
                "Churned_361d"
            ]
        },
        "PlayerVenueTargetingClassification": {
            "name": "PlayerVenueTargetingClassification",
            "values": [
                "Active_EL",
                "Active",
                "Retain_Inactive31_60d",
                "Retain_Inactive61_90d",
                "Churn_91_120d",
                "Churn_121_180d",
                "Churn_181_360d",
                "Churn_361d"
            ]
        },
        "TransactionType": {
            "name": "TransactionType",
            "values": [
                "BUY_IN",
                "DEPOSIT",
                "TICKET_AWARD",
                "TICKET_REDEMPTION",
                "CASH_AWARD",
                "QUALIFICATION",
                "WITHDRAWAL"
            ]
        },
        "MessageStatus": {
            "name": "MessageStatus",
            "values": [
                "SENT",
                "DELIVERED",
                "FAILED",
                "READ"
            ]
        },
        "UserRole": {
            "name": "UserRole",
            "values": [
                "SUPER_ADMIN",
                "ADMIN",
                "VENUE_MANAGER",
                "TOURNAMENT_DIRECTOR",
                "MARKETING"
            ]
        },
        "StaffRole": {
            "name": "StaffRole",
            "values": [
                "DEALER",
                "FLOOR_MANAGER",
                "SERVICE",
                "TOURNAMENT_DIRECTOR"
            ]
        },
        "TicketStatus": {
            "name": "TicketStatus",
            "values": [
                "ACTIVE",
                "EXPIRED",
                "USED"
            ]
        },
        "PlayerEntryStatus": {
            "name": "PlayerEntryStatus",
            "values": [
                "REGISTERED",
                "VOIDED",
                "PLAYING",
                "ELIMINATED",
                "COMPLETED"
            ]
        },
        "CreditTransactionType": {
            "name": "CreditTransactionType",
            "values": [
                "AWARD_PROMOTION",
                "AWARD_REFUND",
                "AWARD_MANUAL",
                "REDEEM_GAME_BUY_IN",
                "EXPIRED"
            ]
        },
        "PointsTransactionType": {
            "name": "PointsTransactionType",
            "values": [
                "EARN_FROM_PLAY",
                "EARN_FROM_PROMOTION",
                "REDEEM_FOR_BUY_IN",
                "REDEEM_FOR_MERCH",
                "ADJUSTMENT_MANUAL",
                "EXPIRED"
            ]
        },
        "VenueAssignmentStatus": {
            "name": "VenueAssignmentStatus",
            "values": [
                "AUTO_ASSIGNED",
                "MANUALLY_ASSIGNED",
                "PENDING_ASSIGNMENT",
                "UNASSIGNED",
                "RETROACTIVE_ASSIGNED"
            ]
        },
        "ScraperJobTriggerSource": {
            "name": "ScraperJobTriggerSource",
            "values": [
                "SCHEDULED",
                "MANUAL",
                "API",
                "CONTROL",
                "BULK",
                "ADMIN"
            ]
        },
        "ScraperJobStatus": {
            "name": "ScraperJobStatus",
            "values": [
                "QUEUED",
                "RUNNING",
                "COMPLETED",
                "FAILED",
                "CANCELLED",
                "TIMEOUT"
            ]
        },
        "ScrapeURLStatus": {
            "name": "ScrapeURLStatus",
            "values": [
                "ACTIVE",
                "INACTIVE",
                "DO_NOT_SCRAPE",
                "ERROR",
                "ARCHIVED"
            ]
        },
        "ScrapeAttemptStatus": {
            "name": "ScrapeAttemptStatus",
            "values": [
                "SUCCESS",
                "FAILED",
                "SKIPPED_DONOTSCRAPE",
                "SKIPPED_VENUE",
                "BLANK",
                "NO_CHANGES",
                "UPDATED",
                "SAVED"
            ]
        },
        "TimeRange": {
            "name": "TimeRange",
            "values": [
                "LAST_HOUR",
                "LAST_24_HOURS",
                "LAST_7_DAYS",
                "LAST_30_DAYS",
                "CUSTOM"
            ]
        },
        "ScraperOperation": {
            "name": "ScraperOperation",
            "values": [
                "START",
                "STOP",
                "ENABLE",
                "DISABLE",
                "STATUS",
                "RESET"
            ]
        }
    },
    "nonModels": {
        "ScraperControlResponse": {
            "name": "ScraperControlResponse",
            "fields": {
                "success": {
                    "name": "success",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": true,
                    "attributes": []
                },
                "message": {
                    "name": "message",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "state": {
                    "name": "state",
                    "isArray": false,
                    "type": {
                        "nonModel": "ScraperStateData"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "results": {
                    "name": "results",
                    "isArray": false,
                    "type": {
                        "nonModel": "ScraperResults"
                    },
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "ScraperStateData": {
            "name": "ScraperStateData",
            "fields": {
                "id": {
                    "name": "id",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "isRunning": {
                    "name": "isRunning",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": true,
                    "attributes": []
                },
                "lastScannedId": {
                    "name": "lastScannedId",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "lastRunStartTime": {
                    "name": "lastRunStartTime",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "lastRunEndTime": {
                    "name": "lastRunEndTime",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "consecutiveBlankCount": {
                    "name": "consecutiveBlankCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "totalScraped": {
                    "name": "totalScraped",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "totalErrors": {
                    "name": "totalErrors",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "enabled": {
                    "name": "enabled",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": true,
                    "attributes": []
                },
                "currentLog": {
                    "name": "currentLog",
                    "isArray": true,
                    "type": {
                        "nonModel": "ScraperLogData"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "lastGamesProcessed": {
                    "name": "lastGamesProcessed",
                    "isArray": true,
                    "type": {
                        "nonModel": "ScrapedGameStatus"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "entityId": {
                    "name": "entityId",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "ScraperResults": {
            "name": "ScraperResults",
            "fields": {
                "newGamesScraped": {
                    "name": "newGamesScraped",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "gamesUpdated": {
                    "name": "gamesUpdated",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "errors": {
                    "name": "errors",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "blanks": {
                    "name": "blanks",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                }
            }
        },
        "ScraperLogData": {
            "name": "ScraperLogData",
            "fields": {
                "timestamp": {
                    "name": "timestamp",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": true,
                    "attributes": []
                },
                "level": {
                    "name": "level",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "message": {
                    "name": "message",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "details": {
                    "name": "details",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "ScrapedGameStatus": {
            "name": "ScrapedGameStatus",
            "fields": {
                "id": {
                    "name": "id",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "name": {
                    "name": "name",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "status": {
                    "name": "status",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                }
            }
        },
        "S3VersionHistory": {
            "name": "S3VersionHistory",
            "fields": {
                "s3Key": {
                    "name": "s3Key",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "scrapedAt": {
                    "name": "scrapedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": true,
                    "attributes": []
                },
                "contentHash": {
                    "name": "contentHash",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "uploadedBy": {
                    "name": "uploadedBy",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "contentSize": {
                    "name": "contentSize",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "TournamentLevel": {
            "name": "TournamentLevel",
            "fields": {
                "levelNumber": {
                    "name": "levelNumber",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "durationMinutes": {
                    "name": "durationMinutes",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "smallBlind": {
                    "name": "smallBlind",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "bigBlind": {
                    "name": "bigBlind",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "ante": {
                    "name": "ante",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "Break": {
            "name": "Break",
            "fields": {
                "levelNumberBeforeBreak": {
                    "name": "levelNumberBeforeBreak",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "durationMinutes": {
                    "name": "durationMinutes",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "ClientMetricResponse": {
            "name": "ClientMetricResponse",
            "fields": {
                "success": {
                    "name": "success",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": true,
                    "attributes": []
                },
                "message": {
                    "name": "message",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "userId": {
                    "name": "userId",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "UserMetricsSummary": {
            "name": "UserMetricsSummary",
            "fields": {
                "userId": {
                    "name": "userId",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "userName": {
                    "name": "userName",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "totalActions": {
                    "name": "totalActions",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "totalPageViews": {
                    "name": "totalPageViews",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "totalErrors": {
                    "name": "totalErrors",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "lastActive": {
                    "name": "lastActive",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "mostUsedFeature": {
                    "name": "mostUsedFeature",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "S3StorageConnection": {
            "name": "S3StorageConnection",
            "fields": {
                "items": {
                    "name": "items",
                    "isArray": true,
                    "type": {
                        "model": "S3Storage"
                    },
                    "isRequired": true,
                    "attributes": [],
                    "isArrayNullable": false
                },
                "nextToken": {
                    "name": "nextToken",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "CachingStatsResponse": {
            "name": "CachingStatsResponse",
            "fields": {
                "totalURLs": {
                    "name": "totalURLs",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "urlsWithETags": {
                    "name": "urlsWithETags",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "urlsWithLastModified": {
                    "name": "urlsWithLastModified",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "totalCacheHits": {
                    "name": "totalCacheHits",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "totalCacheMisses": {
                    "name": "totalCacheMisses",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "averageCacheHitRate": {
                    "name": "averageCacheHitRate",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": true,
                    "attributes": []
                },
                "storageUsedMB": {
                    "name": "storageUsedMB",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": true,
                    "attributes": []
                },
                "recentCacheActivity": {
                    "name": "recentCacheActivity",
                    "isArray": true,
                    "type": {
                        "nonModel": "CacheActivityLog"
                    },
                    "isRequired": true,
                    "attributes": [],
                    "isArrayNullable": true
                }
            }
        },
        "CacheActivityLog": {
            "name": "CacheActivityLog",
            "fields": {
                "url": {
                    "name": "url",
                    "isArray": false,
                    "type": "AWSURL",
                    "isRequired": true,
                    "attributes": []
                },
                "timestamp": {
                    "name": "timestamp",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": true,
                    "attributes": []
                },
                "action": {
                    "name": "action",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "reason": {
                    "name": "reason",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "DatabaseMetric": {
            "name": "DatabaseMetric",
            "fields": {
                "timestamp": {
                    "name": "timestamp",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": true,
                    "attributes": []
                },
                "functionName": {
                    "name": "functionName",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "operation": {
                    "name": "operation",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "table": {
                    "name": "table",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "success": {
                    "name": "success",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": true,
                    "attributes": []
                },
                "duration": {
                    "name": "duration",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "count": {
                    "name": "count",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "entityId": {
                    "name": "entityId",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "DatabaseMetricsResponse": {
            "name": "DatabaseMetricsResponse",
            "fields": {
                "metrics": {
                    "name": "metrics",
                    "isArray": true,
                    "type": {
                        "nonModel": "DatabaseMetric"
                    },
                    "isRequired": true,
                    "attributes": [],
                    "isArrayNullable": false
                }
            }
        },
        "S3StorageHistoryResponse": {
            "name": "S3StorageHistoryResponse",
            "fields": {
                "items": {
                    "name": "items",
                    "isArray": true,
                    "type": {
                        "model": "S3Storage"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "nextToken": {
                    "name": "nextToken",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "S3ContentResponse": {
            "name": "S3ContentResponse",
            "fields": {
                "s3Key": {
                    "name": "s3Key",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "html": {
                    "name": "html",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "metadata": {
                    "name": "metadata",
                    "isArray": false,
                    "type": "AWSJSON",
                    "isRequired": false,
                    "attributes": []
                },
                "size": {
                    "name": "size",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "lastModified": {
                    "name": "lastModified",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "CachingStats": {
            "name": "CachingStats",
            "fields": {
                "totalURLs": {
                    "name": "totalURLs",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "urlsWithETags": {
                    "name": "urlsWithETags",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "urlsWithLastModified": {
                    "name": "urlsWithLastModified",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "totalCacheHits": {
                    "name": "totalCacheHits",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "totalCacheMisses": {
                    "name": "totalCacheMisses",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "averageCacheHitRate": {
                    "name": "averageCacheHitRate",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": true,
                    "attributes": []
                },
                "storageUsedMB": {
                    "name": "storageUsedMB",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": true,
                    "attributes": []
                },
                "recentCacheActivity": {
                    "name": "recentCacheActivity",
                    "isArray": true,
                    "type": {
                        "nonModel": "CacheActivity"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                }
            }
        },
        "CacheActivity": {
            "name": "CacheActivity",
            "fields": {
                "url": {
                    "name": "url",
                    "isArray": false,
                    "type": "AWSURL",
                    "isRequired": true,
                    "attributes": []
                },
                "timestamp": {
                    "name": "timestamp",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": true,
                    "attributes": []
                },
                "action": {
                    "name": "action",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "reason": {
                    "name": "reason",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                }
            }
        },
        "S3StorageListResponse": {
            "name": "S3StorageListResponse",
            "fields": {
                "items": {
                    "name": "items",
                    "isArray": true,
                    "type": {
                        "model": "S3Storage"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "nextToken": {
                    "name": "nextToken",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "RefreshResponse": {
            "name": "RefreshResponse",
            "fields": {
                "message": {
                    "name": "message",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "status": {
                    "name": "status",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                }
            }
        },
        "ReScrapeResult": {
            "name": "ReScrapeResult",
            "fields": {
                "name": {
                    "name": "name",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "gameStartDateTime": {
                    "name": "gameStartDateTime",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "gameEndDateTime": {
                    "name": "gameEndDateTime",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "gameStatus": {
                    "name": "gameStatus",
                    "isArray": false,
                    "type": {
                        "enum": "GameStatus"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "registrationStatus": {
                    "name": "registrationStatus",
                    "isArray": false,
                    "type": {
                        "enum": "RegistrationStatus"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "gameType": {
                    "name": "gameType",
                    "isArray": false,
                    "type": {
                        "enum": "GameType"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "gameVariant": {
                    "name": "gameVariant",
                    "isArray": false,
                    "type": {
                        "enum": "GameVariant"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "tournamentType": {
                    "name": "tournamentType",
                    "isArray": false,
                    "type": {
                        "enum": "TournamentType"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "prizepool": {
                    "name": "prizepool",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "buyIn": {
                    "name": "buyIn",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "rake": {
                    "name": "rake",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "startingStack": {
                    "name": "startingStack",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "hasGuarantee": {
                    "name": "hasGuarantee",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "guaranteeAmount": {
                    "name": "guaranteeAmount",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalEntries": {
                    "name": "totalEntries",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "totalRebuys": {
                    "name": "totalRebuys",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "totalAddons": {
                    "name": "totalAddons",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "totalDuration": {
                    "name": "totalDuration",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "playersRemaining": {
                    "name": "playersRemaining",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "seriesName": {
                    "name": "seriesName",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "gameTags": {
                    "name": "gameTags",
                    "isArray": true,
                    "type": "String",
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "venueMatch": {
                    "name": "venueMatch",
                    "isArray": false,
                    "type": {
                        "nonModel": "VenueMatch"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "existingGameId": {
                    "name": "existingGameId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "doNotScrape": {
                    "name": "doNotScrape",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "sourceUrl": {
                    "name": "sourceUrl",
                    "isArray": false,
                    "type": "AWSURL",
                    "isRequired": false,
                    "attributes": []
                },
                "tournamentId": {
                    "name": "tournamentId",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "entityId": {
                    "name": "entityId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "s3Key": {
                    "name": "s3Key",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "reScrapedAt": {
                    "name": "reScrapedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "EntityVenueAssignmentSummary": {
            "name": "EntityVenueAssignmentSummary",
            "fields": {
                "entityId": {
                    "name": "entityId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "entityName": {
                    "name": "entityName",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "totalGames": {
                    "name": "totalGames",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "gamesWithVenue": {
                    "name": "gamesWithVenue",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "gamesNeedingVenue": {
                    "name": "gamesNeedingVenue",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "EntityScraperMetrics": {
            "name": "EntityScraperMetrics",
            "fields": {
                "entityId": {
                    "name": "entityId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "entityName": {
                    "name": "entityName",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "totalJobs": {
                    "name": "totalJobs",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "successfulJobs": {
                    "name": "successfulJobs",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "failedJobs": {
                    "name": "failedJobs",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "totalURLsScraped": {
                    "name": "totalURLsScraped",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                }
            }
        },
        "GamesNeedingVenueResponse": {
            "name": "GamesNeedingVenueResponse",
            "fields": {
                "items": {
                    "name": "items",
                    "isArray": true,
                    "type": {
                        "model": "Game"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "nextToken": {
                    "name": "nextToken",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "totalCount": {
                    "name": "totalCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "VenueAssignmentSummary": {
            "name": "VenueAssignmentSummary",
            "fields": {
                "totalGames": {
                    "name": "totalGames",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "gamesWithVenue": {
                    "name": "gamesWithVenue",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "gamesNeedingVenue": {
                    "name": "gamesNeedingVenue",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "pendingAssignments": {
                    "name": "pendingAssignments",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "byEntity": {
                    "name": "byEntity",
                    "isArray": true,
                    "type": {
                        "nonModel": "EntityVenueAssignmentSummary"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                }
            }
        },
        "VenueAssignmentResult": {
            "name": "VenueAssignmentResult",
            "fields": {
                "success": {
                    "name": "success",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": true,
                    "attributes": []
                },
                "gameId": {
                    "name": "gameId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "venueId": {
                    "name": "venueId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "affectedRecords": {
                    "name": "affectedRecords",
                    "isArray": false,
                    "type": {
                        "nonModel": "AffectedRecords"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "error": {
                    "name": "error",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "AffectedRecords": {
            "name": "AffectedRecords",
            "fields": {
                "gameUpdated": {
                    "name": "gameUpdated",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "playerEntriesUpdated": {
                    "name": "playerEntriesUpdated",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "playerVenueRecordsCreated": {
                    "name": "playerVenueRecordsCreated",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "playersWithRegistrationUpdated": {
                    "name": "playersWithRegistrationUpdated",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "playerSummariesUpdated": {
                    "name": "playerSummariesUpdated",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "BatchVenueAssignmentResult": {
            "name": "BatchVenueAssignmentResult",
            "fields": {
                "successful": {
                    "name": "successful",
                    "isArray": true,
                    "type": {
                        "nonModel": "VenueAssignmentResult"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "failed": {
                    "name": "failed",
                    "isArray": true,
                    "type": {
                        "nonModel": "VenueAssignmentResult"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "totalProcessed": {
                    "name": "totalProcessed",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "ScraperJobURLResult": {
            "name": "ScraperJobURLResult",
            "fields": {
                "url": {
                    "name": "url",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "tournamentId": {
                    "name": "tournamentId",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "status": {
                    "name": "status",
                    "isArray": false,
                    "type": {
                        "enum": "ScrapeAttemptStatus"
                    },
                    "isRequired": true,
                    "attributes": []
                },
                "gameName": {
                    "name": "gameName",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "processingTime": {
                    "name": "processingTime",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "error": {
                    "name": "error",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "ScraperMetrics": {
            "name": "ScraperMetrics",
            "fields": {
                "totalJobs": {
                    "name": "totalJobs",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "successfulJobs": {
                    "name": "successfulJobs",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "failedJobs": {
                    "name": "failedJobs",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "averageJobDuration": {
                    "name": "averageJobDuration",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": true,
                    "attributes": []
                },
                "totalURLsScraped": {
                    "name": "totalURLsScraped",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "successRate": {
                    "name": "successRate",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": true,
                    "attributes": []
                },
                "topErrors": {
                    "name": "topErrors",
                    "isArray": true,
                    "type": {
                        "nonModel": "ErrorMetric"
                    },
                    "isRequired": true,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "hourlyActivity": {
                    "name": "hourlyActivity",
                    "isArray": true,
                    "type": {
                        "nonModel": "HourlyMetric"
                    },
                    "isRequired": true,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "byEntity": {
                    "name": "byEntity",
                    "isArray": true,
                    "type": {
                        "nonModel": "EntityScraperMetrics"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                }
            }
        },
        "ErrorMetric": {
            "name": "ErrorMetric",
            "fields": {
                "errorType": {
                    "name": "errorType",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "count": {
                    "name": "count",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "urls": {
                    "name": "urls",
                    "isArray": true,
                    "type": "String",
                    "isRequired": true,
                    "attributes": [],
                    "isArrayNullable": true
                }
            }
        },
        "HourlyMetric": {
            "name": "HourlyMetric",
            "fields": {
                "hour": {
                    "name": "hour",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "jobCount": {
                    "name": "jobCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "urlsScraped": {
                    "name": "urlsScraped",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "successRate": {
                    "name": "successRate",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": true,
                    "attributes": []
                }
            }
        },
        "ScraperJobConnection": {
            "name": "ScraperJobConnection",
            "fields": {
                "items": {
                    "name": "items",
                    "isArray": true,
                    "type": {
                        "model": "ScraperJob"
                    },
                    "isRequired": true,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "nextToken": {
                    "name": "nextToken",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "ScrapeURLConnection": {
            "name": "ScrapeURLConnection",
            "fields": {
                "items": {
                    "name": "items",
                    "isArray": true,
                    "type": {
                        "model": "ScrapeURL"
                    },
                    "isRequired": true,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "nextToken": {
                    "name": "nextToken",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "ScrapedGameSummary": {
            "name": "ScrapedGameSummary",
            "fields": {
                "id": {
                    "name": "id",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "name": {
                    "name": "name",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "gameStatus": {
                    "name": "gameStatus",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "registrationStatus": {
                    "name": "registrationStatus",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "gameStartDateTime": {
                    "name": "gameStartDateTime",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "inDatabase": {
                    "name": "inDatabase",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "doNotScrape": {
                    "name": "doNotScrape",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "error": {
                    "name": "error",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "ScrapedGameData": {
            "name": "ScrapedGameData",
            "fields": {
                "name": {
                    "name": "name",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "gameStartDateTime": {
                    "name": "gameStartDateTime",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "gameEndDateTime": {
                    "name": "gameEndDateTime",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "gameStatus": {
                    "name": "gameStatus",
                    "isArray": false,
                    "type": {
                        "enum": "GameStatus"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "registrationStatus": {
                    "name": "registrationStatus",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "gameType": {
                    "name": "gameType",
                    "isArray": false,
                    "type": {
                        "enum": "GameType"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "gameVariant": {
                    "name": "gameVariant",
                    "isArray": false,
                    "type": {
                        "enum": "GameVariant"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "tournamentType": {
                    "name": "tournamentType",
                    "isArray": false,
                    "type": {
                        "enum": "TournamentType"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "prizepool": {
                    "name": "prizepool",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "revenueByBuyIns": {
                    "name": "revenueByBuyIns",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "profitLoss": {
                    "name": "profitLoss",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "buyIn": {
                    "name": "buyIn",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "rake": {
                    "name": "rake",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalRake": {
                    "name": "totalRake",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "startingStack": {
                    "name": "startingStack",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "hasGuarantee": {
                    "name": "hasGuarantee",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "guaranteeAmount": {
                    "name": "guaranteeAmount",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "guaranteeOverlay": {
                    "name": "guaranteeOverlay",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "guaranteeSurplus": {
                    "name": "guaranteeSurplus",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalEntries": {
                    "name": "totalEntries",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "totalRebuys": {
                    "name": "totalRebuys",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "totalAddons": {
                    "name": "totalAddons",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "totalDuration": {
                    "name": "totalDuration",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "playersRemaining": {
                    "name": "playersRemaining",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "totalChipsInPlay": {
                    "name": "totalChipsInPlay",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "averagePlayerStack": {
                    "name": "averagePlayerStack",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "seriesName": {
                    "name": "seriesName",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "isRegular": {
                    "name": "isRegular",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "isSeries": {
                    "name": "isSeries",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "isSatellite": {
                    "name": "isSatellite",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "gameFrequency": {
                    "name": "gameFrequency",
                    "isArray": false,
                    "type": {
                        "enum": "GameFrequency"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "gameTags": {
                    "name": "gameTags",
                    "isArray": true,
                    "type": "String",
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "levels": {
                    "name": "levels",
                    "isArray": true,
                    "type": {
                        "nonModel": "ScrapedTournamentLevel"
                    },
                    "isRequired": true,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "breaks": {
                    "name": "breaks",
                    "isArray": true,
                    "type": {
                        "nonModel": "ScrapedBreak"
                    },
                    "isRequired": true,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "entries": {
                    "name": "entries",
                    "isArray": true,
                    "type": {
                        "nonModel": "ScrapedPlayerEntry"
                    },
                    "isRequired": true,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "seating": {
                    "name": "seating",
                    "isArray": true,
                    "type": {
                        "nonModel": "ScrapedPlayerSeating"
                    },
                    "isRequired": true,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "results": {
                    "name": "results",
                    "isArray": true,
                    "type": {
                        "nonModel": "ScrapedPlayerResult"
                    },
                    "isRequired": true,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "tables": {
                    "name": "tables",
                    "isArray": true,
                    "type": {
                        "nonModel": "ScrapedTable"
                    },
                    "isRequired": true,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "rawHtml": {
                    "name": "rawHtml",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "isNewStructure": {
                    "name": "isNewStructure",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "structureLabel": {
                    "name": "structureLabel",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "foundKeys": {
                    "name": "foundKeys",
                    "isArray": true,
                    "type": "String",
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "venueMatch": {
                    "name": "venueMatch",
                    "isArray": false,
                    "type": {
                        "nonModel": "ScrapedVenueMatch"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "existingGameId": {
                    "name": "existingGameId",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "doNotScrape": {
                    "name": "doNotScrape",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "tournamentId": {
                    "name": "tournamentId",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "entityId": {
                    "name": "entityId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "sourceUrl": {
                    "name": "sourceUrl",
                    "isArray": false,
                    "type": "AWSURL",
                    "isRequired": false,
                    "attributes": []
                },
                "s3Key": {
                    "name": "s3Key",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "source": {
                    "name": "source",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "contentHash": {
                    "name": "contentHash",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "fetchedAt": {
                    "name": "fetchedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "reScrapedAt": {
                    "name": "reScrapedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "wasForced": {
                    "name": "wasForced",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "ScrapedTournamentLevel": {
            "name": "ScrapedTournamentLevel",
            "fields": {
                "levelNumber": {
                    "name": "levelNumber",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "durationMinutes": {
                    "name": "durationMinutes",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "smallBlind": {
                    "name": "smallBlind",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "bigBlind": {
                    "name": "bigBlind",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "ante": {
                    "name": "ante",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "ScrapedBreak": {
            "name": "ScrapedBreak",
            "fields": {
                "levelNumberBeforeBreak": {
                    "name": "levelNumberBeforeBreak",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "durationMinutes": {
                    "name": "durationMinutes",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "ScrapedPlayerEntry": {
            "name": "ScrapedPlayerEntry",
            "fields": {
                "name": {
                    "name": "name",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                }
            }
        },
        "ScrapedPlayerSeating": {
            "name": "ScrapedPlayerSeating",
            "fields": {
                "name": {
                    "name": "name",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "table": {
                    "name": "table",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "seat": {
                    "name": "seat",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "playerStack": {
                    "name": "playerStack",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "ScrapedPlayerResult": {
            "name": "ScrapedPlayerResult",
            "fields": {
                "rank": {
                    "name": "rank",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "name": {
                    "name": "name",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "winnings": {
                    "name": "winnings",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "points": {
                    "name": "points",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "isQualification": {
                    "name": "isQualification",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "ScrapedTable": {
            "name": "ScrapedTable",
            "fields": {
                "tableName": {
                    "name": "tableName",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "seats": {
                    "name": "seats",
                    "isArray": true,
                    "type": {
                        "nonModel": "ScrapedTableSeatData"
                    },
                    "isRequired": true,
                    "attributes": [],
                    "isArrayNullable": true
                }
            }
        },
        "ScrapedTableSeatData": {
            "name": "ScrapedTableSeatData",
            "fields": {
                "seat": {
                    "name": "seat",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "isOccupied": {
                    "name": "isOccupied",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": true,
                    "attributes": []
                },
                "playerName": {
                    "name": "playerName",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "playerStack": {
                    "name": "playerStack",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "ScrapedVenueMatch": {
            "name": "ScrapedVenueMatch",
            "fields": {
                "autoAssignedVenue": {
                    "name": "autoAssignedVenue",
                    "isArray": false,
                    "type": {
                        "nonModel": "ScrapedVenueMatchDetails"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "suggestions": {
                    "name": "suggestions",
                    "isArray": true,
                    "type": {
                        "nonModel": "ScrapedVenueMatchDetails"
                    },
                    "isRequired": true,
                    "attributes": [],
                    "isArrayNullable": true
                }
            }
        },
        "ScrapedVenueMatchDetails": {
            "name": "ScrapedVenueMatchDetails",
            "fields": {
                "id": {
                    "name": "id",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "name": {
                    "name": "name",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "score": {
                    "name": "score",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": true,
                    "attributes": []
                }
            }
        },
        "AllCountsResult": {
            "name": "AllCountsResult",
            "fields": {
                "playerCount": {
                    "name": "playerCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "playerSummaryCount": {
                    "name": "playerSummaryCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "playerEntryCount": {
                    "name": "playerEntryCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "playerResultCount": {
                    "name": "playerResultCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "playerVenueCount": {
                    "name": "playerVenueCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "playerTransactionCount": {
                    "name": "playerTransactionCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "playerCreditsCount": {
                    "name": "playerCreditsCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "playerPointsCount": {
                    "name": "playerPointsCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "playerTicketCount": {
                    "name": "playerTicketCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "playerMarketingPreferencesCount": {
                    "name": "playerMarketingPreferencesCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "playerMarketingMessageCount": {
                    "name": "playerMarketingMessageCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "gameCount": {
                    "name": "gameCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "tournamentStructureCount": {
                    "name": "tournamentStructureCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "VenueMatch": {
            "name": "VenueMatch",
            "fields": {
                "autoAssignedVenue": {
                    "name": "autoAssignedVenue",
                    "isArray": false,
                    "type": {
                        "nonModel": "ScrapedVenueMatchDetails"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "suggestions": {
                    "name": "suggestions",
                    "isArray": true,
                    "type": {
                        "nonModel": "ScrapedVenueMatchDetails"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                }
            }
        }
    },
    "codegenVersion": "3.4.4",
    "version": "15bba30dfdcf69fb95ab974fc7838a24"
};