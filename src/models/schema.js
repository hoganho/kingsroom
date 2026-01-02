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
                "defaultVenueId": {
                    "name": "defaultVenueId",
                    "isArray": false,
                    "type": "ID",
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
                },
                "gameCount": {
                    "name": "gameCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "venueCount": {
                    "name": "venueCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "lastGameAddedAt": {
                    "name": "lastGameAddedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "lastDataRefreshedAt": {
                    "name": "lastDataRefreshedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "seriesGameCount": {
                    "name": "seriesGameCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "lastSeriesGameAddedAt": {
                    "name": "lastSeriesGameAddedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
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
                },
                "tournamentSeries": {
                    "name": "tournamentSeries",
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
                            "entity"
                        ]
                    }
                },
                "recurringGames": {
                    "name": "recurringGames",
                    "isArray": true,
                    "type": {
                        "model": "RecurringGame"
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
                "entityMetrics": {
                    "name": "entityMetrics",
                    "isArray": true,
                    "type": {
                        "model": "EntityMetrics"
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
                "venueMetrics": {
                    "name": "venueMetrics",
                    "isArray": true,
                    "type": {
                        "model": "VenueMetrics"
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
                "recurringGameMetrics": {
                    "name": "recurringGameMetrics",
                    "isArray": true,
                    "type": {
                        "model": "RecurringGameMetrics"
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
                "tournamentSeriesMetrics": {
                    "name": "tournamentSeriesMetrics",
                    "isArray": true,
                    "type": {
                        "model": "TournamentSeriesMetrics"
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
                "socialAccounts": {
                    "name": "socialAccounts",
                    "isArray": true,
                    "type": {
                        "model": "SocialAccount"
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
                    "properties": {
                        "subscriptions": null
                    }
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
        "BackgroundTask": {
            "name": "BackgroundTask",
            "fields": {
                "id": {
                    "name": "id",
                    "isArray": false,
                    "type": "ID",
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
                "taskType": {
                    "name": "taskType",
                    "isArray": false,
                    "type": {
                        "enum": "BackgroundTaskType"
                    },
                    "isRequired": true,
                    "attributes": []
                },
                "status": {
                    "name": "status",
                    "isArray": false,
                    "type": {
                        "enum": "BackgroundTaskStatus"
                    },
                    "isRequired": true,
                    "attributes": []
                },
                "targetType": {
                    "name": "targetType",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "targetId": {
                    "name": "targetId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "targetIds": {
                    "name": "targetIds",
                    "isArray": true,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "targetCount": {
                    "name": "targetCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "payload": {
                    "name": "payload",
                    "isArray": false,
                    "type": "AWSJSON",
                    "isRequired": false,
                    "attributes": []
                },
                "processedCount": {
                    "name": "processedCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "progressPercent": {
                    "name": "progressPercent",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "result": {
                    "name": "result",
                    "isArray": false,
                    "type": "AWSJSON",
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
                "createdAt": {
                    "name": "createdAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": true,
                    "attributes": []
                },
                "startedAt": {
                    "name": "startedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "completedAt": {
                    "name": "completedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "initiatedBy": {
                    "name": "initiatedBy",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
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
            "pluralName": "BackgroundTasks",
            "attributes": [
                {
                    "type": "model",
                    "properties": {
                        "subscriptions": null
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byEntityTask",
                        "queryField": "tasksByEntity",
                        "fields": [
                            "entityId",
                            "createdAt"
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
                "fee": {
                    "name": "fee",
                    "isArray": false,
                    "type": "Float",
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
                "logo": {
                    "name": "logo",
                    "isArray": false,
                    "type": "AWSURL",
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
                "lastGameAddedAt": {
                    "name": "lastGameAddedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "lastDataRefreshedAt": {
                    "name": "lastDataRefreshedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "seriesGameCount": {
                    "name": "seriesGameCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "lastSeriesGameAddedAt": {
                    "name": "lastSeriesGameAddedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "canonicalVenueId": {
                    "name": "canonicalVenueId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
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
                "recurringGames": {
                    "name": "recurringGames",
                    "isArray": true,
                    "type": {
                        "model": "RecurringGame"
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
                "venueMetrics": {
                    "name": "venueMetrics",
                    "isArray": true,
                    "type": {
                        "model": "VenueMetrics"
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
                "recurringGameMetrics": {
                    "name": "recurringGameMetrics",
                    "isArray": true,
                    "type": {
                        "model": "RecurringGameMetrics"
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
                "socialAccounts": {
                    "name": "socialAccounts",
                    "isArray": true,
                    "type": {
                        "model": "SocialAccount"
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
                    "properties": {
                        "subscriptions": null
                    }
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
                        "name": "byCanonicalVenue",
                        "fields": [
                            "canonicalVenueId"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byEntityVenue",
                        "queryField": "venuesByEntity",
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
                "averageUniquePlayersPerGame": {
                    "name": "averageUniquePlayersPerGame",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "averageEntriesPerGame": {
                    "name": "averageEntriesPerGame",
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
                    "properties": {
                        "subscriptions": null
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
                "venueFee": {
                    "name": "venueFee",
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
                "prizepoolPaid": {
                    "name": "prizepoolPaid",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "prizepoolCalculated": {
                    "name": "prizepoolCalculated",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalUniquePlayers": {
                    "name": "totalUniquePlayers",
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
                "totalInitialEntries": {
                    "name": "totalInitialEntries",
                    "isArray": false,
                    "type": "Int",
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
                "totalBuyInsCollected": {
                    "name": "totalBuyInsCollected",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "rakeRevenue": {
                    "name": "rakeRevenue",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "prizepoolPlayerContributions": {
                    "name": "prizepoolPlayerContributions",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "prizepoolAddedValue": {
                    "name": "prizepoolAddedValue",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "prizepoolSurplus": {
                    "name": "prizepoolSurplus",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "guaranteeOverlayCost": {
                    "name": "guaranteeOverlayCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "gameProfit": {
                    "name": "gameProfit",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "hasJackpotContributions": {
                    "name": "hasJackpotContributions",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "jackpotContributionAmount": {
                    "name": "jackpotContributionAmount",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "hasAccumulatorTickets": {
                    "name": "hasAccumulatorTickets",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "accumulatorTicketValue": {
                    "name": "accumulatorTicketValue",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "numberOfAccumulatorTicketsPaid": {
                    "name": "numberOfAccumulatorTicketsPaid",
                    "isArray": false,
                    "type": "Int",
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
                "isSatellite": {
                    "name": "isSatellite",
                    "isArray": false,
                    "type": "Boolean",
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
                "dealerDealt": {
                    "name": "dealerDealt",
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
                "seriesName": {
                    "name": "seriesName",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "isMainEvent": {
                    "name": "isMainEvent",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "eventNumber": {
                    "name": "eventNumber",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "dayNumber": {
                    "name": "dayNumber",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "flightLetter": {
                    "name": "flightLetter",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "finalDay": {
                    "name": "finalDay",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "parentGameId": {
                    "name": "parentGameId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "parentGame": {
                    "name": "parentGame",
                    "isArray": false,
                    "type": {
                        "model": "Game"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "association": {
                        "connectionType": "BELONGS_TO",
                        "targetNames": [
                            "parentGameId"
                        ]
                    }
                },
                "childGames": {
                    "name": "childGames",
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
                            "parentGame"
                        ]
                    }
                },
                "consolidationType": {
                    "name": "consolidationType",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "consolidationKey": {
                    "name": "consolidationKey",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "isPartialData": {
                    "name": "isPartialData",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "missingFlightCount": {
                    "name": "missingFlightCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "expectedTotalEntries": {
                    "name": "expectedTotalEntries",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "gameDayOfWeek": {
                    "name": "gameDayOfWeek",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "gameYearMonth": {
                    "name": "gameYearMonth",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "buyInBucket": {
                    "name": "buyInBucket",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "venueScheduleKey": {
                    "name": "venueScheduleKey",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "venueGameTypeKey": {
                    "name": "venueGameTypeKey",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "entityQueryKey": {
                    "name": "entityQueryKey",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "entityGameTypeKey": {
                    "name": "entityGameTypeKey",
                    "isArray": false,
                    "type": "String",
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
                "originalScrapedData": {
                    "name": "originalScrapedData",
                    "isArray": false,
                    "type": "AWSJSON",
                    "isRequired": false,
                    "attributes": []
                },
                "wasEdited": {
                    "name": "wasEdited",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "lastEditedAt": {
                    "name": "lastEditedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "lastEditedBy": {
                    "name": "lastEditedBy",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "editHistory": {
                    "name": "editHistory",
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
                "seriesAssignmentStatus": {
                    "name": "seriesAssignmentStatus",
                    "isArray": false,
                    "type": {
                        "enum": "SeriesAssignmentStatus"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "seriesAssignmentConfidence": {
                    "name": "seriesAssignmentConfidence",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "suggestedSeriesName": {
                    "name": "suggestedSeriesName",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "levels": {
                    "name": "levels",
                    "isArray": false,
                    "type": "AWSJSON",
                    "isRequired": false,
                    "attributes": []
                },
                "sessionMode": {
                    "name": "sessionMode",
                    "isArray": false,
                    "type": {
                        "enum": "SessionMode"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "variant": {
                    "name": "variant",
                    "isArray": false,
                    "type": {
                        "enum": "PokerVariant"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "bettingStructure": {
                    "name": "bettingStructure",
                    "isArray": false,
                    "type": {
                        "enum": "BettingStructure"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "speedType": {
                    "name": "speedType",
                    "isArray": false,
                    "type": {
                        "enum": "SpeedType"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "tableSize": {
                    "name": "tableSize",
                    "isArray": false,
                    "type": {
                        "enum": "TableSize"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "maxPlayers": {
                    "name": "maxPlayers",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "dealType": {
                    "name": "dealType",
                    "isArray": false,
                    "type": {
                        "enum": "DealType"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "buyInTier": {
                    "name": "buyInTier",
                    "isArray": false,
                    "type": {
                        "enum": "BuyInTier"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "entryStructure": {
                    "name": "entryStructure",
                    "isArray": false,
                    "type": {
                        "enum": "EntryStructure"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "bountyType": {
                    "name": "bountyType",
                    "isArray": false,
                    "type": {
                        "enum": "BountyType"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "bountyAmount": {
                    "name": "bountyAmount",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "bountyPercentage": {
                    "name": "bountyPercentage",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "tournamentPurpose": {
                    "name": "tournamentPurpose",
                    "isArray": false,
                    "type": {
                        "enum": "TournamentPurpose"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "stackDepth": {
                    "name": "stackDepth",
                    "isArray": false,
                    "type": {
                        "enum": "StackDepth"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "lateRegistration": {
                    "name": "lateRegistration",
                    "isArray": false,
                    "type": {
                        "enum": "LateRegistration"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "payoutStructure": {
                    "name": "payoutStructure",
                    "isArray": false,
                    "type": {
                        "enum": "PayoutStructure"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "scheduleType": {
                    "name": "scheduleType",
                    "isArray": false,
                    "type": {
                        "enum": "TournamentScheduleType"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "isShootout": {
                    "name": "isShootout",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "isSurvivor": {
                    "name": "isSurvivor",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "isFlipAndGo": {
                    "name": "isFlipAndGo",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "isWinTheButton": {
                    "name": "isWinTheButton",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "isAnteOnly": {
                    "name": "isAnteOnly",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "isBigBlindAnte": {
                    "name": "isBigBlindAnte",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "cashGameType": {
                    "name": "cashGameType",
                    "isArray": false,
                    "type": {
                        "enum": "CashGameType"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "cashRakeType": {
                    "name": "cashRakeType",
                    "isArray": false,
                    "type": {
                        "enum": "CashRakeType"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "hasBombPots": {
                    "name": "hasBombPots",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "hasRunItTwice": {
                    "name": "hasRunItTwice",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "hasStraddle": {
                    "name": "hasStraddle",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "mixedGameRotation": {
                    "name": "mixedGameRotation",
                    "isArray": true,
                    "type": {
                        "enum": "MixedGameComponent"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "classificationSource": {
                    "name": "classificationSource",
                    "isArray": false,
                    "type": {
                        "enum": "ClassificationSource"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "classificationConfidence": {
                    "name": "classificationConfidence",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "lastClassifiedAt": {
                    "name": "lastClassifiedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
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
                "gameCostId": {
                    "name": "gameCostId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "gameCost": {
                    "name": "gameCost",
                    "isArray": false,
                    "type": {
                        "model": "GameCost"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "association": {
                        "connectionType": "HAS_ONE",
                        "associatedWith": [
                            "id"
                        ],
                        "targetNames": [
                            "gameCostId"
                        ]
                    }
                },
                "gameFinancialSnapshotId": {
                    "name": "gameFinancialSnapshotId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "gameFinancialSnapshot": {
                    "name": "gameFinancialSnapshot",
                    "isArray": false,
                    "type": {
                        "model": "GameFinancialSnapshot"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "association": {
                        "connectionType": "HAS_ONE",
                        "associatedWith": [
                            "id"
                        ],
                        "targetNames": [
                            "gameFinancialSnapshotId"
                        ]
                    }
                },
                "linkedSocialPosts": {
                    "name": "linkedSocialPosts",
                    "isArray": true,
                    "type": {
                        "model": "SocialPost"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true,
                    "association": {
                        "connectionType": "HAS_MANY",
                        "associatedWith": [
                            "linkedGame"
                        ]
                    }
                },
                "socialPostLinks": {
                    "name": "socialPostLinks",
                    "isArray": true,
                    "type": {
                        "model": "SocialPostGameLink"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true,
                    "association": {
                        "connectionType": "HAS_MANY",
                        "associatedWith": [
                            "gameId"
                        ]
                    }
                },
                "linkedSocialPostCount": {
                    "name": "linkedSocialPostCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "hasLinkedSocialPosts": {
                    "name": "hasLinkedSocialPosts",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "primaryResultPostId": {
                    "name": "primaryResultPostId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "primaryResultPost": {
                    "name": "primaryResultPost",
                    "isArray": false,
                    "type": {
                        "model": "SocialPost"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "association": {
                        "connectionType": "HAS_ONE",
                        "associatedWith": [
                            "id"
                        ],
                        "targetNames": [
                            "primaryResultPostId"
                        ]
                    }
                },
                "socialDataAggregation": {
                    "name": "socialDataAggregation",
                    "isArray": false,
                    "type": "AWSJSON",
                    "isRequired": false,
                    "attributes": []
                },
                "socialDataAggregatedAt": {
                    "name": "socialDataAggregatedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "ticketsAwarded": {
                    "name": "ticketsAwarded",
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
                            "wonFromGame"
                        ]
                    }
                },
                "ticketsAwardedCount": {
                    "name": "ticketsAwardedCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "ticketProgramName": {
                    "name": "ticketProgramName",
                    "isArray": false,
                    "type": "String",
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
                "recurringGameId": {
                    "name": "recurringGameId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "recurringGame": {
                    "name": "recurringGame",
                    "isArray": false,
                    "type": {
                        "model": "RecurringGame"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "association": {
                        "connectionType": "BELONGS_TO",
                        "targetNames": [
                            "recurringGameId"
                        ]
                    }
                },
                "recurringGameAssignmentConfidence": {
                    "name": "recurringGameAssignmentConfidence",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "recurringGameAssignmentStatus": {
                    "name": "recurringGameAssignmentStatus",
                    "isArray": false,
                    "type": {
                        "enum": "RecurringGameAssignmentStatus"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "wasScheduledInstance": {
                    "name": "wasScheduledInstance",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "deviationNotes": {
                    "name": "deviationNotes",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "instanceNumber": {
                    "name": "instanceNumber",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "isReplacementInstance": {
                    "name": "isReplacementInstance",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "replacementReason": {
                    "name": "replacementReason",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
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
                    "properties": {
                        "subscriptions": null
                    }
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
                        "name": "byParentGame",
                        "fields": [
                            "parentGameId",
                            "gameStartDateTime"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byConsolidationType",
                        "fields": [
                            "consolidationType",
                            "gameStartDateTime"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byConsolidationKey",
                        "queryField": "gamesByConsolidationKey",
                        "fields": [
                            "consolidationKey"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byDayOfWeek",
                        "fields": [
                            "gameDayOfWeek",
                            "gameStartDateTime"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byGameMonth",
                        "queryField": "gamesByMonth",
                        "fields": [
                            "gameYearMonth",
                            "gameStartDateTime"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byBuyInBucket",
                        "fields": [
                            "buyInBucket",
                            "gameStartDateTime"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byVenueSchedule",
                        "fields": [
                            "venueScheduleKey",
                            "gameStartDateTime"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byVenueGameType",
                        "fields": [
                            "venueGameTypeKey",
                            "gameStartDateTime"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byEntityQuery",
                        "fields": [
                            "entityQueryKey",
                            "gameStartDateTime"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byEntityGameType",
                        "fields": [
                            "entityGameTypeKey",
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
                        "name": "byTournamentId",
                        "queryField": "gamesByTournamentId",
                        "fields": [
                            "tournamentId"
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
                        "queryField": "gamesByEntity",
                        "fields": [
                            "entityId",
                            "gameStartDateTime"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byEntityAndTournamentId",
                        "queryField": "gamesByEntityAndTournamentId",
                        "fields": [
                            "entityId",
                            "tournamentId"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byRecurringGame",
                        "fields": [
                            "recurringGameId",
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
                    "properties": {
                        "subscriptions": null
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
                    "properties": {
                        "subscriptions": null
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
                    "properties": {
                        "subscriptions": null
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
                    "properties": {
                        "subscriptions": null
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
        "GameFinancialSnapshot": {
            "name": "GameFinancialSnapshot",
            "fields": {
                "id": {
                    "name": "id",
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
                "gameCostId": {
                    "name": "gameCostId",
                    "isArray": false,
                    "type": "ID",
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
                "venueId": {
                    "name": "venueId",
                    "isArray": false,
                    "type": "ID",
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
                "totalBuyInsCollected": {
                    "name": "totalBuyInsCollected",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "rakeRevenue": {
                    "name": "rakeRevenue",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "venueFee": {
                    "name": "venueFee",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalRevenue": {
                    "name": "totalRevenue",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": true,
                    "attributes": []
                },
                "prizepoolPlayerContributions": {
                    "name": "prizepoolPlayerContributions",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "prizepoolAddedValue": {
                    "name": "prizepoolAddedValue",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "prizepoolTotal": {
                    "name": "prizepoolTotal",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "prizepoolSurplus": {
                    "name": "prizepoolSurplus",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "prizepoolPaidDelta": {
                    "name": "prizepoolPaidDelta",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "prizepoolJackpotContributions": {
                    "name": "prizepoolJackpotContributions",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "prizepoolAccumulatorTicketPayoutEstimate": {
                    "name": "prizepoolAccumulatorTicketPayoutEstimate",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "prizepoolAccumulatorTicketPayoutActual": {
                    "name": "prizepoolAccumulatorTicketPayoutActual",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalDealerCost": {
                    "name": "totalDealerCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalTournamentDirectorCost": {
                    "name": "totalTournamentDirectorCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalFloorStaffCost": {
                    "name": "totalFloorStaffCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalSecurityCost": {
                    "name": "totalSecurityCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalStaffCost": {
                    "name": "totalStaffCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalPrizeContribution": {
                    "name": "totalPrizeContribution",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalJackpotContribution": {
                    "name": "totalJackpotContribution",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalGuaranteeOverlayCost": {
                    "name": "totalGuaranteeOverlayCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalAddedValueCost": {
                    "name": "totalAddedValueCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalBountyCost": {
                    "name": "totalBountyCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalDirectGameCost": {
                    "name": "totalDirectGameCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalVenueRentalCost": {
                    "name": "totalVenueRentalCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalEquipmentRentalCost": {
                    "name": "totalEquipmentRentalCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalFoodBeverageCost": {
                    "name": "totalFoodBeverageCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalMarketingCost": {
                    "name": "totalMarketingCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalStreamingCost": {
                    "name": "totalStreamingCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalOperationsCost": {
                    "name": "totalOperationsCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalInsuranceCost": {
                    "name": "totalInsuranceCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalLicensingCost": {
                    "name": "totalLicensingCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalComplianceCost": {
                    "name": "totalComplianceCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalStaffTravelCost": {
                    "name": "totalStaffTravelCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalPlayerAccommodationCost": {
                    "name": "totalPlayerAccommodationCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalPromotionCost": {
                    "name": "totalPromotionCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalOtherCost": {
                    "name": "totalOtherCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalCost": {
                    "name": "totalCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": true,
                    "attributes": []
                },
                "gameProfit": {
                    "name": "gameProfit",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "netProfit": {
                    "name": "netProfit",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": true,
                    "attributes": []
                },
                "profitMargin": {
                    "name": "profitMargin",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "revenuePerPlayer": {
                    "name": "revenuePerPlayer",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "costPerPlayer": {
                    "name": "costPerPlayer",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "profitPerPlayer": {
                    "name": "profitPerPlayer",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "rakePerEntry": {
                    "name": "rakePerEntry",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "dealerCostPerHour": {
                    "name": "dealerCostPerHour",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "staffCostPerPlayer": {
                    "name": "staffCostPerPlayer",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "promoSpendPerPlayer": {
                    "name": "promoSpendPerPlayer",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "guaranteeCoverageRate": {
                    "name": "guaranteeCoverageRate",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "guaranteeMet": {
                    "name": "guaranteeMet",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "totalUniquePlayers": {
                    "name": "totalUniquePlayers",
                    "isArray": false,
                    "type": "Int",
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
                "guaranteeAmount": {
                    "name": "guaranteeAmount",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "gameDurationMinutes": {
                    "name": "gameDurationMinutes",
                    "isArray": false,
                    "type": "Int",
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
                "tournamentType": {
                    "name": "tournamentType",
                    "isArray": false,
                    "type": {
                        "enum": "TournamentType"
                    },
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
                "isSeriesParent": {
                    "name": "isSeriesParent",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "parentGameId": {
                    "name": "parentGameId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "tournamentSeriesId": {
                    "name": "tournamentSeriesId",
                    "isArray": false,
                    "type": "ID",
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
                "recurringGameId": {
                    "name": "recurringGameId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "entitySeriesKey": {
                    "name": "entitySeriesKey",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "venueSeriesKey": {
                    "name": "venueSeriesKey",
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
                "snapshotType": {
                    "name": "snapshotType",
                    "isArray": false,
                    "type": {
                        "enum": "SnapshotType"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "isReconciled": {
                    "name": "isReconciled",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "reconciledAt": {
                    "name": "reconciledAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "reconciledBy": {
                    "name": "reconciledBy",
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
            "pluralName": "GameFinancialSnapshots",
            "attributes": [
                {
                    "type": "model",
                    "properties": {
                        "subscriptions": null
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byGameFinancialSnapshot",
                        "fields": [
                            "gameId"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byEntityGameFinancialSnapshot",
                        "fields": [
                            "entityId",
                            "gameStartDateTime"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byVenueGameFinancialSnapshot",
                        "fields": [
                            "venueId",
                            "gameStartDateTime"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byGameStartDateFinancialSnapshot",
                        "fields": [
                            "gameStartDateTime",
                            "netProfit"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byTournamentSeriesSnapshot",
                        "fields": [
                            "tournamentSeriesId",
                            "gameStartDateTime"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byRecurringGameSnapshot",
                        "fields": [
                            "recurringGameId",
                            "gameStartDateTime"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byEntitySeriesKey",
                        "fields": [
                            "entitySeriesKey",
                            "gameStartDateTime"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byVenueSeriesKey",
                        "fields": [
                            "venueSeriesKey",
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
        "GameCost": {
            "name": "GameCost",
            "fields": {
                "id": {
                    "name": "id",
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
                "totalDealerCost": {
                    "name": "totalDealerCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalTournamentDirectorCost": {
                    "name": "totalTournamentDirectorCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalFloorStaffCost": {
                    "name": "totalFloorStaffCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalSecurityCost": {
                    "name": "totalSecurityCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalPrizeContribution": {
                    "name": "totalPrizeContribution",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalJackpotContribution": {
                    "name": "totalJackpotContribution",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalGuaranteeOverlayCost": {
                    "name": "totalGuaranteeOverlayCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalAddedValueCost": {
                    "name": "totalAddedValueCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalBountyCost": {
                    "name": "totalBountyCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalVenueRentalCost": {
                    "name": "totalVenueRentalCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalEquipmentRentalCost": {
                    "name": "totalEquipmentRentalCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalFoodBeverageCost": {
                    "name": "totalFoodBeverageCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalMarketingCost": {
                    "name": "totalMarketingCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalStreamingCost": {
                    "name": "totalStreamingCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalInsuranceCost": {
                    "name": "totalInsuranceCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalLicensingCost": {
                    "name": "totalLicensingCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalStaffTravelCost": {
                    "name": "totalStaffTravelCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalPlayerAccommodationCost": {
                    "name": "totalPlayerAccommodationCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalPromotionCost": {
                    "name": "totalPromotionCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalOtherCost": {
                    "name": "totalOtherCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalStaffCost": {
                    "name": "totalStaffCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalDirectGameCost": {
                    "name": "totalDirectGameCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalOperationsCost": {
                    "name": "totalOperationsCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalComplianceCost": {
                    "name": "totalComplianceCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalCost": {
                    "name": "totalCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": true,
                    "attributes": []
                },
                "lineItems": {
                    "name": "lineItems",
                    "isArray": true,
                    "type": {
                        "model": "GameCostLineItem"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true,
                    "association": {
                        "connectionType": "HAS_MANY",
                        "associatedWith": [
                            "gameCost"
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
                "venueId": {
                    "name": "venueId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "gameDate": {
                    "name": "gameDate",
                    "isArray": false,
                    "type": "AWSDateTime",
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
                "isEstimate": {
                    "name": "isEstimate",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "costStatus": {
                    "name": "costStatus",
                    "isArray": false,
                    "type": {
                        "enum": "CostStatus"
                    },
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
            "pluralName": "GameCosts",
            "attributes": [
                {
                    "type": "model",
                    "properties": {
                        "subscriptions": null
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byGameCost",
                        "fields": [
                            "gameId"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byEntityCost",
                        "fields": [
                            "entityId",
                            "gameDate"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byVenueCost",
                        "fields": [
                            "venueId",
                            "gameDate"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byGameDateCost",
                        "fields": [
                            "gameDate",
                            "totalCost"
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
        "GameCostLineItem": {
            "name": "GameCostLineItem",
            "fields": {
                "id": {
                    "name": "id",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "gameCostId": {
                    "name": "gameCostId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "gameCost": {
                    "name": "gameCost",
                    "isArray": false,
                    "type": {
                        "model": "GameCost"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "association": {
                        "connectionType": "BELONGS_TO",
                        "targetNames": [
                            "gameCostId"
                        ]
                    }
                },
                "costItemId": {
                    "name": "costItemId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "costItem": {
                    "name": "costItem",
                    "isArray": false,
                    "type": {
                        "model": "GameCostItem"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "association": {
                        "connectionType": "BELONGS_TO",
                        "targetNames": [
                            "costItemId"
                        ]
                    }
                },
                "costType": {
                    "name": "costType",
                    "isArray": false,
                    "type": {
                        "enum": "CostItemType"
                    },
                    "isRequired": true,
                    "attributes": []
                },
                "rateType": {
                    "name": "rateType",
                    "isArray": false,
                    "type": {
                        "enum": "CostItemRateType"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "amount": {
                    "name": "amount",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": true,
                    "attributes": []
                },
                "quantity": {
                    "name": "quantity",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "rate": {
                    "name": "rate",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "hours": {
                    "name": "hours",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "staffMemberId": {
                    "name": "staffMemberId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "staffMemberName": {
                    "name": "staffMemberName",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "description": {
                    "name": "description",
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
                "gameId": {
                    "name": "gameId",
                    "isArray": false,
                    "type": "ID",
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
                "venueId": {
                    "name": "venueId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "gameDate": {
                    "name": "gameDate",
                    "isArray": false,
                    "type": "AWSDateTime",
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
            "pluralName": "GameCostLineItems",
            "attributes": [
                {
                    "type": "model",
                    "properties": {
                        "subscriptions": null
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byGameCost",
                        "fields": [
                            "gameCostId"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byCostItem",
                        "fields": [
                            "costItemId"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byCostTypeLine",
                        "fields": [
                            "costType",
                            "gameDate"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byGameLineItem",
                        "fields": [
                            "gameId"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byEntityLineItem",
                        "fields": [
                            "entityId",
                            "gameDate"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byVenueLineItem",
                        "fields": [
                            "venueId",
                            "gameDate"
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
        "GameCostItem": {
            "name": "GameCostItem",
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
                "costType": {
                    "name": "costType",
                    "isArray": false,
                    "type": {
                        "enum": "CostItemType"
                    },
                    "isRequired": true,
                    "attributes": []
                },
                "rateType": {
                    "name": "rateType",
                    "isArray": false,
                    "type": {
                        "enum": "CostItemRateType"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "defaultRate": {
                    "name": "defaultRate",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "isPerHour": {
                    "name": "isPerHour",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "isActive": {
                    "name": "isActive",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "description": {
                    "name": "description",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "lineItems": {
                    "name": "lineItems",
                    "isArray": true,
                    "type": {
                        "model": "GameCostLineItem"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true,
                    "association": {
                        "connectionType": "HAS_MANY",
                        "associatedWith": [
                            "costItem"
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
            "pluralName": "GameCostItems",
            "attributes": [
                {
                    "type": "model",
                    "properties": {
                        "subscriptions": null
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byCostType",
                        "fields": [
                            "costType",
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
        "RecurringGame": {
            "name": "RecurringGame",
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
                "displayName": {
                    "name": "displayName",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "description": {
                    "name": "description",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
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
                "entityId": {
                    "name": "entityId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
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
                "dayOfWeek": {
                    "name": "dayOfWeek",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "startTime": {
                    "name": "startTime",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "endTime": {
                    "name": "endTime",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "frequency": {
                    "name": "frequency",
                    "isArray": false,
                    "type": {
                        "enum": "GameFrequency"
                    },
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
                "tournamentType": {
                    "name": "tournamentType",
                    "isArray": false,
                    "type": {
                        "enum": "TournamentType"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "typicalBuyIn": {
                    "name": "typicalBuyIn",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "typicalRake": {
                    "name": "typicalRake",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "typicalStartingStack": {
                    "name": "typicalStartingStack",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "typicalGuarantee": {
                    "name": "typicalGuarantee",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "hasJackpotContributions": {
                    "name": "hasJackpotContributions",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "jackpotContributionAmount": {
                    "name": "jackpotContributionAmount",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "hasAccumulatorTickets": {
                    "name": "hasAccumulatorTickets",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "accumulatorTicketValue": {
                    "name": "accumulatorTicketValue",
                    "isArray": false,
                    "type": "Float",
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
                "isPaused": {
                    "name": "isPaused",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "pausedReason": {
                    "name": "pausedReason",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "lastGameDate": {
                    "name": "lastGameDate",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "nextScheduledDate": {
                    "name": "nextScheduledDate",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "expectedInstanceCount": {
                    "name": "expectedInstanceCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "isSignature": {
                    "name": "isSignature",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "isBeginnerFriendly": {
                    "name": "isBeginnerFriendly",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "isBounty": {
                    "name": "isBounty",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "tags": {
                    "name": "tags",
                    "isArray": true,
                    "type": "String",
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "marketingDescription": {
                    "name": "marketingDescription",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "imageUrl": {
                    "name": "imageUrl",
                    "isArray": false,
                    "type": "AWSURL",
                    "isRequired": false,
                    "attributes": []
                },
                "socialMediaHashtags": {
                    "name": "socialMediaHashtags",
                    "isArray": true,
                    "type": "String",
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "autoDetectionConfidence": {
                    "name": "autoDetectionConfidence",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "wasManuallyCreated": {
                    "name": "wasManuallyCreated",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "requiresReview": {
                    "name": "requiresReview",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "totalInstancesRun": {
                    "name": "totalInstancesRun",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "avgAttendance": {
                    "name": "avgAttendance",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "lastMonthAttendance": {
                    "name": "lastMonthAttendance",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "gameInstances": {
                    "name": "gameInstances",
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
                            "recurringGame"
                        ]
                    }
                },
                "metrics": {
                    "name": "metrics",
                    "isArray": true,
                    "type": {
                        "model": "RecurringGameMetrics"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true,
                    "association": {
                        "connectionType": "HAS_MANY",
                        "associatedWith": [
                            "recurringGame"
                        ]
                    }
                },
                "notes": {
                    "name": "notes",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "adminNotes": {
                    "name": "adminNotes",
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
                },
                "createdBy": {
                    "name": "createdBy",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "lastEditedBy": {
                    "name": "lastEditedBy",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "lastEditedAt": {
                    "name": "lastEditedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                }
            },
            "syncable": true,
            "pluralName": "RecurringGames",
            "attributes": [
                {
                    "type": "model",
                    "properties": {
                        "subscriptions": null
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byRecurringGameName",
                        "fields": [
                            "name",
                            "venueId"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byEntityRecurringGame",
                        "fields": [
                            "entityId",
                            "venueId",
                            "name"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byVenueRecurringGame",
                        "fields": [
                            "venueId",
                            "dayOfWeek",
                            "name"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byDayOfWeekRecurring",
                        "fields": [
                            "dayOfWeek",
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
                "seriesCategory": {
                    "name": "seriesCategory",
                    "isArray": false,
                    "type": {
                        "enum": "SeriesCategory"
                    },
                    "isRequired": false,
                    "attributes": []
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
                    "properties": {
                        "subscriptions": null
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
                "quarter": {
                    "name": "quarter",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "month": {
                    "name": "month",
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
                "seriesCategory": {
                    "name": "seriesCategory",
                    "isArray": false,
                    "type": {
                        "enum": "SeriesCategory"
                    },
                    "isRequired": true,
                    "attributes": []
                },
                "holidayType": {
                    "name": "holidayType",
                    "isArray": false,
                    "type": {
                        "enum": "HolidayType"
                    },
                    "isRequired": false,
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
                "metrics": {
                    "name": "metrics",
                    "isArray": true,
                    "type": {
                        "model": "TournamentSeriesMetrics"
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
                    "properties": {
                        "subscriptions": null
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byName",
                        "fields": [
                            "name",
                            "year"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byYear",
                        "fields": [
                            "year",
                            "name"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byQuarter",
                        "fields": [
                            "quarter",
                            "year"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byMonth",
                        "fields": [
                            "month",
                            "year"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byEntityTournamentSeries",
                        "queryField": "tournamentSeriesByEntityId",
                        "fields": [
                            "entityId"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "bySeriesCategory",
                        "fields": [
                            "seriesCategory",
                            "year"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byHolidayType",
                        "fields": [
                            "holidayType",
                            "year"
                        ]
                    }
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
                            "player"
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
                    "properties": {
                        "subscriptions": null
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byPrimaryEntity",
                        "queryField": "playersByEntity",
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
                    "properties": {
                        "subscriptions": null
                    }
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
                "entityId": {
                    "name": "entityId",
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
                "isMultiDayTournament": {
                    "name": "isMultiDayTournament",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "qualifyingGameId": {
                    "name": "qualifyingGameId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "entryType": {
                    "name": "entryType",
                    "isArray": false,
                    "type": {
                        "enum": "EntryType"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "recordType": {
                    "name": "recordType",
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
            "pluralName": "PlayerEntries",
            "attributes": [
                {
                    "type": "model",
                    "properties": {
                        "subscriptions": null
                    }
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
                    "type": "key",
                    "properties": {
                        "name": "byEntityEntry",
                        "fields": [
                            "entityId",
                            "gameStartDateTime"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byRecordType",
                        "fields": [
                            "recordType",
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
                "gameStartDateTime": {
                    "name": "gameStartDateTime",
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
                "recordType": {
                    "name": "recordType",
                    "isArray": false,
                    "type": "String",
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
                "entityId": {
                    "name": "entityId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "isConsolidatedRecord": {
                    "name": "isConsolidatedRecord",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "sourceEntryCount": {
                    "name": "sourceEntryCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "sourceBuyInCount": {
                    "name": "sourceBuyInCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "totalBuyInsPaid": {
                    "name": "totalBuyInsPaid",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "netProfitLoss": {
                    "name": "netProfitLoss",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "consolidatedIntoGameId": {
                    "name": "consolidatedIntoGameId",
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
            "pluralName": "PlayerResults",
            "attributes": [
                {
                    "type": "model",
                    "properties": {
                        "subscriptions": null
                    }
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
                        "name": "byRecordTypeResult",
                        "fields": [
                            "recordType",
                            "gameStartDateTime"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byVenueResult",
                        "fields": [
                            "venueId",
                            "gameStartDateTime"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byEntityResult",
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
                "entityId": {
                    "name": "entityId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "visityKey": {
                    "name": "visityKey",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "canonicalVenueId": {
                    "name": "canonicalVenueId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
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
                "totalBuyIns": {
                    "name": "totalBuyIns",
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
                "netProfit": {
                    "name": "netProfit",
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
                    "properties": {
                        "subscriptions": null
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byPlayer",
                        "fields": [
                            "playerId",
                            "visityKey"
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
                    "type": "key",
                    "properties": {
                        "name": "byEntityPlayerVenue",
                        "fields": [
                            "entityId",
                            "venueId"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byVisitKey",
                        "queryField": "playerVenueByVisitKey",
                        "fields": [
                            "visityKey"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byCanonicalVenuePlayer",
                        "fields": [
                            "canonicalVenueId",
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
                "venueId": {
                    "name": "venueId",
                    "isArray": false,
                    "type": "ID",
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
                    "properties": {
                        "subscriptions": null
                    }
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
                    "type": "key",
                    "properties": {
                        "name": "byVenueTransaction",
                        "fields": [
                            "venueId",
                            "transactionDate"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byEntityTransaction",
                        "fields": [
                            "entityId",
                            "transactionDate"
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
                    "properties": {
                        "subscriptions": null
                    }
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
                    "properties": {
                        "subscriptions": null
                    }
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
                    "properties": {
                        "subscriptions": null
                    }
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
                "entityId": {
                    "name": "entityId",
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
                "isActive": {
                    "name": "isActive",
                    "isArray": false,
                    "type": "Boolean",
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
            "pluralName": "TicketTemplates",
            "attributes": [
                {
                    "type": "model",
                    "properties": {
                        "subscriptions": null
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byOriginGame",
                        "fields": [
                            "originGameId"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byTargetGame",
                        "fields": [
                            "targetGameId"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byEntityTemplate",
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
                "wonFromGameId": {
                    "name": "wonFromGameId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "wonFromGame": {
                    "name": "wonFromGame",
                    "isArray": false,
                    "type": {
                        "model": "Game"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "association": {
                        "connectionType": "BELONGS_TO",
                        "targetNames": [
                            "wonFromGameId"
                        ]
                    }
                },
                "wonFromPosition": {
                    "name": "wonFromPosition",
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
                        "enum": "TicketStatus"
                    },
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
                    "isRequired": false,
                    "attributes": []
                },
                "usedInGameId": {
                    "name": "usedInGameId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "usedAt": {
                    "name": "usedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "ticketValue": {
                    "name": "ticketValue",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "programName": {
                    "name": "programName",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "awardReason": {
                    "name": "awardReason",
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
            "pluralName": "PlayerTickets",
            "attributes": [
                {
                    "type": "model",
                    "properties": {
                        "subscriptions": null
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byPlayer",
                        "fields": [
                            "playerId",
                            "assignedAt"
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
                    "type": "key",
                    "properties": {
                        "name": "byWonFromGame",
                        "queryField": "ticketsByWonFromGame",
                        "fields": [
                            "wonFromGameId",
                            "assignedAt"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byEntityTicket",
                        "fields": [
                            "entityId",
                            "assignedAt"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byVenueTicket",
                        "fields": [
                            "venueId",
                            "assignedAt"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byUsedInGame",
                        "fields": [
                            "usedInGameId"
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
                    "properties": {
                        "subscriptions": null
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
                    "properties": {
                        "subscriptions": null
                    }
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
                    "properties": {
                        "subscriptions": null
                    }
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
        "EntityMetrics": {
            "name": "EntityMetrics",
            "fields": {
                "id": {
                    "name": "id",
                    "isArray": false,
                    "type": "ID",
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
                "timeRange": {
                    "name": "timeRange",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "seriesType": {
                    "name": "seriesType",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "totalVenues": {
                    "name": "totalVenues",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "activeVenues": {
                    "name": "activeVenues",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "inactiveVenues": {
                    "name": "inactiveVenues",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "totalGames": {
                    "name": "totalGames",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "totalSeriesGames": {
                    "name": "totalSeriesGames",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "totalRegularGames": {
                    "name": "totalRegularGames",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "totalRecurringGames": {
                    "name": "totalRecurringGames",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "totalOneOffGames": {
                    "name": "totalOneOffGames",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "totalActiveRecurringGameTypes": {
                    "name": "totalActiveRecurringGameTypes",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "totalActiveTournamentSeries": {
                    "name": "totalActiveTournamentSeries",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "totalEntries": {
                    "name": "totalEntries",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "totalUniquePlayers": {
                    "name": "totalUniquePlayers",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "totalReentries": {
                    "name": "totalReentries",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "totalAddons": {
                    "name": "totalAddons",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "totalPrizepool": {
                    "name": "totalPrizepool",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": true,
                    "attributes": []
                },
                "totalRevenue": {
                    "name": "totalRevenue",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": true,
                    "attributes": []
                },
                "totalCost": {
                    "name": "totalCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": true,
                    "attributes": []
                },
                "totalProfit": {
                    "name": "totalProfit",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": true,
                    "attributes": []
                },
                "totalRakeRevenue": {
                    "name": "totalRakeRevenue",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": true,
                    "attributes": []
                },
                "totalVenueFees": {
                    "name": "totalVenueFees",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": true,
                    "attributes": []
                },
                "totalStaffCost": {
                    "name": "totalStaffCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": true,
                    "attributes": []
                },
                "totalVenueRentalCost": {
                    "name": "totalVenueRentalCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": true,
                    "attributes": []
                },
                "totalMarketingCost": {
                    "name": "totalMarketingCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": true,
                    "attributes": []
                },
                "totalOperationsCost": {
                    "name": "totalOperationsCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": true,
                    "attributes": []
                },
                "avgEntriesPerGame": {
                    "name": "avgEntriesPerGame",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "avgPrizepoolPerGame": {
                    "name": "avgPrizepoolPerGame",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "avgProfitPerGame": {
                    "name": "avgProfitPerGame",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "avgRevenuePerGame": {
                    "name": "avgRevenuePerGame",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "avgGamesPerVenue": {
                    "name": "avgGamesPerVenue",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "avgPlayersPerVenue": {
                    "name": "avgPlayersPerVenue",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "profitMargin": {
                    "name": "profitMargin",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "rakeMarginPercent": {
                    "name": "rakeMarginPercent",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "firstGameDate": {
                    "name": "firstGameDate",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "firstGameDaysAgo": {
                    "name": "firstGameDaysAgo",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "latestGameDate": {
                    "name": "latestGameDate",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "latestGameDaysAgo": {
                    "name": "latestGameDaysAgo",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "profitTrend": {
                    "name": "profitTrend",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "profitTrendPercent": {
                    "name": "profitTrendPercent",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "playerGrowthTrend": {
                    "name": "playerGrowthTrend",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "playerGrowthTrendPercent": {
                    "name": "playerGrowthTrendPercent",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "revenueGrowthTrend": {
                    "name": "revenueGrowthTrend",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "revenueGrowthTrendPercent": {
                    "name": "revenueGrowthTrendPercent",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "topVenuesByRevenue": {
                    "name": "topVenuesByRevenue",
                    "isArray": false,
                    "type": "AWSJSON",
                    "isRequired": false,
                    "attributes": []
                },
                "topVenuesByAttendance": {
                    "name": "topVenuesByAttendance",
                    "isArray": false,
                    "type": "AWSJSON",
                    "isRequired": false,
                    "attributes": []
                },
                "topRecurringGames": {
                    "name": "topRecurringGames",
                    "isArray": false,
                    "type": "AWSJSON",
                    "isRequired": false,
                    "attributes": []
                },
                "topTournamentSeries": {
                    "name": "topTournamentSeries",
                    "isArray": false,
                    "type": "AWSJSON",
                    "isRequired": false,
                    "attributes": []
                },
                "calculatedAt": {
                    "name": "calculatedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": true,
                    "attributes": []
                },
                "calculatedBy": {
                    "name": "calculatedBy",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "calculationDurationMs": {
                    "name": "calculationDurationMs",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "snapshotsIncluded": {
                    "name": "snapshotsIncluded",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "venuesIncluded": {
                    "name": "venuesIncluded",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "recurringGamesIncluded": {
                    "name": "recurringGamesIncluded",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "tournamentSeriesIncluded": {
                    "name": "tournamentSeriesIncluded",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "dateRangeStart": {
                    "name": "dateRangeStart",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "dateRangeEnd": {
                    "name": "dateRangeEnd",
                    "isArray": false,
                    "type": "AWSDateTime",
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
            "pluralName": "EntityMetrics",
            "attributes": [
                {
                    "type": "model",
                    "properties": {
                        "subscriptions": null
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byEntityMetrics",
                        "fields": [
                            "entityId",
                            "timeRange"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byTimeRangeEntity",
                        "fields": [
                            "timeRange",
                            "entityId"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "bySeriesTypeEntity",
                        "fields": [
                            "seriesType",
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
        "VenueMetrics": {
            "name": "VenueMetrics",
            "fields": {
                "id": {
                    "name": "id",
                    "isArray": false,
                    "type": "ID",
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
                "venueId": {
                    "name": "venueId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "venueName": {
                    "name": "venueName",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "timeRange": {
                    "name": "timeRange",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "seriesType": {
                    "name": "seriesType",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "totalGames": {
                    "name": "totalGames",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "totalSeriesGames": {
                    "name": "totalSeriesGames",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "totalRegularGames": {
                    "name": "totalRegularGames",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "totalRecurringGames": {
                    "name": "totalRecurringGames",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "totalOneOffGames": {
                    "name": "totalOneOffGames",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "totalActiveRecurringGameTypes": {
                    "name": "totalActiveRecurringGameTypes",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "totalActiveTournamentSeries": {
                    "name": "totalActiveTournamentSeries",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "totalTournaments": {
                    "name": "totalTournaments",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "totalCashGames": {
                    "name": "totalCashGames",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "totalNLHE": {
                    "name": "totalNLHE",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "totalPLO": {
                    "name": "totalPLO",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "totalOther": {
                    "name": "totalOther",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "totalEntries": {
                    "name": "totalEntries",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "totalUniquePlayers": {
                    "name": "totalUniquePlayers",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "totalReentries": {
                    "name": "totalReentries",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "totalAddons": {
                    "name": "totalAddons",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "returningPlayers": {
                    "name": "returningPlayers",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "newPlayers": {
                    "name": "newPlayers",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "totalPrizepool": {
                    "name": "totalPrizepool",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": true,
                    "attributes": []
                },
                "totalRevenue": {
                    "name": "totalRevenue",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": true,
                    "attributes": []
                },
                "totalCost": {
                    "name": "totalCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": true,
                    "attributes": []
                },
                "totalProfit": {
                    "name": "totalProfit",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": true,
                    "attributes": []
                },
                "totalRakeRevenue": {
                    "name": "totalRakeRevenue",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": true,
                    "attributes": []
                },
                "totalVenueFees": {
                    "name": "totalVenueFees",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": true,
                    "attributes": []
                },
                "totalStaffCost": {
                    "name": "totalStaffCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": true,
                    "attributes": []
                },
                "totalVenueRentalCost": {
                    "name": "totalVenueRentalCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": true,
                    "attributes": []
                },
                "totalMarketingCost": {
                    "name": "totalMarketingCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": true,
                    "attributes": []
                },
                "avgEntriesPerGame": {
                    "name": "avgEntriesPerGame",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "avgUniquePlayersPerGame": {
                    "name": "avgUniquePlayersPerGame",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "avgPrizepoolPerGame": {
                    "name": "avgPrizepoolPerGame",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "avgRevenuePerGame": {
                    "name": "avgRevenuePerGame",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "avgProfitPerGame": {
                    "name": "avgProfitPerGame",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "profitMargin": {
                    "name": "profitMargin",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "rakeMarginPercent": {
                    "name": "rakeMarginPercent",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "firstGameDate": {
                    "name": "firstGameDate",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "firstGameDaysAgo": {
                    "name": "firstGameDaysAgo",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "latestGameDate": {
                    "name": "latestGameDate",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "latestGameDaysAgo": {
                    "name": "latestGameDaysAgo",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "daysSinceLastGame": {
                    "name": "daysSinceLastGame",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "gamesByDayOfWeek": {
                    "name": "gamesByDayOfWeek",
                    "isArray": false,
                    "type": "AWSJSON",
                    "isRequired": false,
                    "attributes": []
                },
                "peakAttendanceDay": {
                    "name": "peakAttendanceDay",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "topRecurringGames": {
                    "name": "topRecurringGames",
                    "isArray": false,
                    "type": "AWSJSON",
                    "isRequired": false,
                    "attributes": []
                },
                "topBuyInLevels": {
                    "name": "topBuyInLevels",
                    "isArray": false,
                    "type": "AWSJSON",
                    "isRequired": false,
                    "attributes": []
                },
                "topTournamentSeries": {
                    "name": "topTournamentSeries",
                    "isArray": false,
                    "type": "AWSJSON",
                    "isRequired": false,
                    "attributes": []
                },
                "profitTrend": {
                    "name": "profitTrend",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "profitTrendPercent": {
                    "name": "profitTrendPercent",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "attendanceTrend": {
                    "name": "attendanceTrend",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "attendanceTrendPercent": {
                    "name": "attendanceTrendPercent",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "revenueGrowthTrend": {
                    "name": "revenueGrowthTrend",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "revenueGrowthTrendPercent": {
                    "name": "revenueGrowthTrendPercent",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "overallHealth": {
                    "name": "overallHealth",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "profitability": {
                    "name": "profitability",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "consistency": {
                    "name": "consistency",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "calculatedAt": {
                    "name": "calculatedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": true,
                    "attributes": []
                },
                "calculatedBy": {
                    "name": "calculatedBy",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "calculationDurationMs": {
                    "name": "calculationDurationMs",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "snapshotsIncluded": {
                    "name": "snapshotsIncluded",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "recurringGamesIncluded": {
                    "name": "recurringGamesIncluded",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "tournamentSeriesIncluded": {
                    "name": "tournamentSeriesIncluded",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "dateRangeStart": {
                    "name": "dateRangeStart",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "dateRangeEnd": {
                    "name": "dateRangeEnd",
                    "isArray": false,
                    "type": "AWSDateTime",
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
            "pluralName": "VenueMetrics",
            "attributes": [
                {
                    "type": "model",
                    "properties": {
                        "subscriptions": null
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byEntityVenueMetrics",
                        "fields": [
                            "entityId",
                            "venueName"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byVenueMetrics",
                        "fields": [
                            "venueId",
                            "timeRange"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byTimeRangeVenue",
                        "fields": [
                            "timeRange",
                            "venueId"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "bySeriesTypeVenue",
                        "fields": [
                            "seriesType",
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
        "RecurringGameMetrics": {
            "name": "RecurringGameMetrics",
            "fields": {
                "id": {
                    "name": "id",
                    "isArray": false,
                    "type": "ID",
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
                "venueId": {
                    "name": "venueId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "recurringGameId": {
                    "name": "recurringGameId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "recurringGame": {
                    "name": "recurringGame",
                    "isArray": false,
                    "type": {
                        "model": "RecurringGame"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "association": {
                        "connectionType": "BELONGS_TO",
                        "targetNames": [
                            "recurringGameId"
                        ]
                    }
                },
                "recurringGameName": {
                    "name": "recurringGameName",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "timeRange": {
                    "name": "timeRange",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "seriesType": {
                    "name": "seriesType",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "totalInstances": {
                    "name": "totalInstances",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "scheduledInstances": {
                    "name": "scheduledInstances",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "actualInstances": {
                    "name": "actualInstances",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "missedInstances": {
                    "name": "missedInstances",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "runRate": {
                    "name": "runRate",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalEntries": {
                    "name": "totalEntries",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "totalUniquePlayers": {
                    "name": "totalUniquePlayers",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "totalReentries": {
                    "name": "totalReentries",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "totalAddons": {
                    "name": "totalAddons",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "regularPlayers": {
                    "name": "regularPlayers",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "occasionalPlayers": {
                    "name": "occasionalPlayers",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "oneTimePlayers": {
                    "name": "oneTimePlayers",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "totalPrizepool": {
                    "name": "totalPrizepool",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": true,
                    "attributes": []
                },
                "totalRevenue": {
                    "name": "totalRevenue",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": true,
                    "attributes": []
                },
                "totalCost": {
                    "name": "totalCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": true,
                    "attributes": []
                },
                "totalProfit": {
                    "name": "totalProfit",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": true,
                    "attributes": []
                },
                "avgEntries": {
                    "name": "avgEntries",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "avgUniquePlayers": {
                    "name": "avgUniquePlayers",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "avgPrizepool": {
                    "name": "avgPrizepool",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "avgRevenue": {
                    "name": "avgRevenue",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "avgProfit": {
                    "name": "avgProfit",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "stdDevEntries": {
                    "name": "stdDevEntries",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "stdDevProfit": {
                    "name": "stdDevProfit",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "minEntries": {
                    "name": "minEntries",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "maxEntries": {
                    "name": "maxEntries",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "medianEntries": {
                    "name": "medianEntries",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "entriesCV": {
                    "name": "entriesCV",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "firstInstanceDate": {
                    "name": "firstInstanceDate",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "firstInstanceDaysAgo": {
                    "name": "firstInstanceDaysAgo",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "latestInstanceDate": {
                    "name": "latestInstanceDate",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "latestInstanceDaysAgo": {
                    "name": "latestInstanceDaysAgo",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "daysSinceLastInstance": {
                    "name": "daysSinceLastInstance",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "avgEntriesByMonth": {
                    "name": "avgEntriesByMonth",
                    "isArray": false,
                    "type": "AWSJSON",
                    "isRequired": false,
                    "attributes": []
                },
                "peakMonth": {
                    "name": "peakMonth",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "lowMonth": {
                    "name": "lowMonth",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "attendanceHealth": {
                    "name": "attendanceHealth",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "profitability": {
                    "name": "profitability",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "consistency": {
                    "name": "consistency",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "overallHealth": {
                    "name": "overallHealth",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "attendanceTrend": {
                    "name": "attendanceTrend",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "attendanceTrendPercent": {
                    "name": "attendanceTrendPercent",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "profitTrend": {
                    "name": "profitTrend",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "profitTrendPercent": {
                    "name": "profitTrendPercent",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "recentAvgEntries": {
                    "name": "recentAvgEntries",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "longtermAvgEntries": {
                    "name": "longtermAvgEntries",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "entriesTrendDirection": {
                    "name": "entriesTrendDirection",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "regularPlayersList": {
                    "name": "regularPlayersList",
                    "isArray": false,
                    "type": "AWSJSON",
                    "isRequired": false,
                    "attributes": []
                },
                "playerRetentionRate": {
                    "name": "playerRetentionRate",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "rankAtVenue": {
                    "name": "rankAtVenue",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "totalRecurringGamesAtVenue": {
                    "name": "totalRecurringGamesAtVenue",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "avgEntriesEntityWide": {
                    "name": "avgEntriesEntityWide",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "performanceVsEntityAvg": {
                    "name": "performanceVsEntityAvg",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "calculatedAt": {
                    "name": "calculatedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": true,
                    "attributes": []
                },
                "calculatedBy": {
                    "name": "calculatedBy",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "calculationDurationMs": {
                    "name": "calculationDurationMs",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "snapshotsIncluded": {
                    "name": "snapshotsIncluded",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "dateRangeStart": {
                    "name": "dateRangeStart",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "dateRangeEnd": {
                    "name": "dateRangeEnd",
                    "isArray": false,
                    "type": "AWSDateTime",
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
            "pluralName": "RecurringGameMetrics",
            "attributes": [
                {
                    "type": "model",
                    "properties": {
                        "subscriptions": null
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byEntityRecurringGameMetrics",
                        "fields": [
                            "entityId",
                            "recurringGameId"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byVenueRecurringGameMetrics",
                        "fields": [
                            "venueId",
                            "recurringGameId"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byRecurringGameMetrics",
                        "fields": [
                            "recurringGameId",
                            "timeRange"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byTimeRangeRecurringGame",
                        "fields": [
                            "timeRange",
                            "recurringGameId"
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
        "TournamentSeriesMetrics": {
            "name": "TournamentSeriesMetrics",
            "fields": {
                "id": {
                    "name": "id",
                    "isArray": false,
                    "type": "ID",
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
                "tournamentSeriesId": {
                    "name": "tournamentSeriesId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
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
                "seriesName": {
                    "name": "seriesName",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "timeRange": {
                    "name": "timeRange",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "seriesType": {
                    "name": "seriesType",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "totalEvents": {
                    "name": "totalEvents",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "totalFlights": {
                    "name": "totalFlights",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "uniqueVenues": {
                    "name": "uniqueVenues",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "mainEventCount": {
                    "name": "mainEventCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "totalEntries": {
                    "name": "totalEntries",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "totalUniquePlayers": {
                    "name": "totalUniquePlayers",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "totalReentries": {
                    "name": "totalReentries",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "totalAddons": {
                    "name": "totalAddons",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "mainEventTotalEntries": {
                    "name": "mainEventTotalEntries",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "regularSeriesPlayers": {
                    "name": "regularSeriesPlayers",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "occasionalSeriesPlayers": {
                    "name": "occasionalSeriesPlayers",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "oneTimeSeriesPlayers": {
                    "name": "oneTimeSeriesPlayers",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "totalPrizepool": {
                    "name": "totalPrizepool",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": true,
                    "attributes": []
                },
                "totalRevenue": {
                    "name": "totalRevenue",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": true,
                    "attributes": []
                },
                "totalCost": {
                    "name": "totalCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": true,
                    "attributes": []
                },
                "totalProfit": {
                    "name": "totalProfit",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": true,
                    "attributes": []
                },
                "avgEntriesPerEvent": {
                    "name": "avgEntriesPerEvent",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "avgUniquePlayersPerEvent": {
                    "name": "avgUniquePlayersPerEvent",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "avgPrizepoolPerEvent": {
                    "name": "avgPrizepoolPerEvent",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "avgRevenuePerEvent": {
                    "name": "avgRevenuePerEvent",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "avgProfitPerEvent": {
                    "name": "avgProfitPerEvent",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "mainEventAvgEntries": {
                    "name": "mainEventAvgEntries",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "stdDevEntries": {
                    "name": "stdDevEntries",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "minEntries": {
                    "name": "minEntries",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "maxEntries": {
                    "name": "maxEntries",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "medianEntries": {
                    "name": "medianEntries",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "entriesCV": {
                    "name": "entriesCV",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "profitMargin": {
                    "name": "profitMargin",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "firstEventDate": {
                    "name": "firstEventDate",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "firstEventDaysAgo": {
                    "name": "firstEventDaysAgo",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "latestEventDate": {
                    "name": "latestEventDate",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "latestEventDaysAgo": {
                    "name": "latestEventDaysAgo",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "seriesDurationDays": {
                    "name": "seriesDurationDays",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "profitability": {
                    "name": "profitability",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "consistency": {
                    "name": "consistency",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "overallHealth": {
                    "name": "overallHealth",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "topEventsByEntries": {
                    "name": "topEventsByEntries",
                    "isArray": false,
                    "type": "AWSJSON",
                    "isRequired": false,
                    "attributes": []
                },
                "topEventsByProfit": {
                    "name": "topEventsByProfit",
                    "isArray": false,
                    "type": "AWSJSON",
                    "isRequired": false,
                    "attributes": []
                },
                "calculatedAt": {
                    "name": "calculatedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": true,
                    "attributes": []
                },
                "calculatedBy": {
                    "name": "calculatedBy",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "calculationDurationMs": {
                    "name": "calculationDurationMs",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "snapshotsIncluded": {
                    "name": "snapshotsIncluded",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "parentSnapshotsIncluded": {
                    "name": "parentSnapshotsIncluded",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "dateRangeStart": {
                    "name": "dateRangeStart",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "dateRangeEnd": {
                    "name": "dateRangeEnd",
                    "isArray": false,
                    "type": "AWSDateTime",
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
            "pluralName": "TournamentSeriesMetrics",
            "attributes": [
                {
                    "type": "model",
                    "properties": {
                        "subscriptions": null
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byEntityTournamentSeriesMetrics",
                        "fields": [
                            "entityId",
                            "tournamentSeriesId"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byTournamentSeriesMetrics",
                        "fields": [
                            "tournamentSeriesId",
                            "timeRange"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byTimeRangeTournamentSeries",
                        "fields": [
                            "timeRange",
                            "tournamentSeriesId"
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
                "currentId": {
                    "name": "currentId",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "stopReason": {
                    "name": "stopReason",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "lastErrorMessage": {
                    "name": "lastErrorMessage",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "notFoundCount": {
                    "name": "notFoundCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "s3CacheHits": {
                    "name": "s3CacheHits",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "consecutiveNotFound": {
                    "name": "consecutiveNotFound",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "consecutiveErrors": {
                    "name": "consecutiveErrors",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "consecutiveBlanks": {
                    "name": "consecutiveBlanks",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
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
                    "isRequired": false,
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
                    "isRequired": false,
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
                },
                "wasEdited": {
                    "name": "wasEdited",
                    "isArray": false,
                    "type": "Boolean",
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
                "wasEdited": {
                    "name": "wasEdited",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "scrapedAt": {
                    "name": "scrapedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "fieldsExtracted": {
                    "name": "fieldsExtracted",
                    "isArray": true,
                    "type": "String",
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
                "contentHash": {
                    "name": "contentHash",
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
                    "properties": {
                        "subscriptions": null
                    }
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
                "highestStoredId": {
                    "name": "highestStoredId",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "lowestStoredId": {
                    "name": "lowestStoredId",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "knownGapRanges": {
                    "name": "knownGapRanges",
                    "isArray": false,
                    "type": "AWSJSON",
                    "isRequired": false,
                    "attributes": []
                },
                "lastGapScanAt": {
                    "name": "lastGapScanAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "totalGamesInDatabase": {
                    "name": "totalGamesInDatabase",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
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
                    "properties": {
                        "subscriptions": null
                    }
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
                "fingerprint": {
                    "name": "fingerprint",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "structureLabel": {
                    "name": "structureLabel",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "foundKeys": {
                    "name": "foundKeys",
                    "isArray": true,
                    "type": "String",
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": false
                },
                "keyCount": {
                    "name": "keyCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "hitCount": {
                    "name": "hitCount",
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
                "isActive": {
                    "name": "isActive",
                    "isArray": false,
                    "type": "Boolean",
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
                    "properties": {
                        "subscriptions": null
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byFingerprint",
                        "queryField": "scrapeStructuresByFingerprint",
                        "fields": [
                            "fingerprint"
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
                    "properties": {
                        "subscriptions": null
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
                "entityTournamentKey": {
                    "name": "entityTournamentKey",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
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
                },
                "isParsed": {
                    "name": "isParsed",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "parsedDataHash": {
                    "name": "parsedDataHash",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "extractedFields": {
                    "name": "extractedFields",
                    "isArray": true,
                    "type": "String",
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "lastParsedAt": {
                    "name": "lastParsedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "parseCount": {
                    "name": "parseCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "rescrapeCount": {
                    "name": "rescrapeCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "lastRescrapeAt": {
                    "name": "lastRescrapeAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "dataChangedAt": {
                    "name": "dataChangedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "dataChangeCount": {
                    "name": "dataChangeCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                }
            },
            "syncable": true,
            "pluralName": "S3Storages",
            "attributes": [
                {
                    "type": "model",
                    "properties": {
                        "subscriptions": null
                    }
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
                        "name": "byEntityTournament",
                        "fields": [
                            "entityTournamentKey"
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
                    "type": {
                        "enum": "SocialPlatform"
                    },
                    "isRequired": true,
                    "attributes": []
                },
                "platformAccountId": {
                    "name": "platformAccountId",
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
                "accountHandle": {
                    "name": "accountHandle",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "accountUrl": {
                    "name": "accountUrl",
                    "isArray": false,
                    "type": "AWSURL",
                    "isRequired": true,
                    "attributes": []
                },
                "businessLocation": {
                    "name": "businessLocation",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "tags": {
                    "name": "tags",
                    "isArray": true,
                    "type": "String",
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "profileImageUrl": {
                    "name": "profileImageUrl",
                    "isArray": false,
                    "type": "AWSURL",
                    "isRequired": false,
                    "attributes": []
                },
                "coverImageUrl": {
                    "name": "coverImageUrl",
                    "isArray": false,
                    "type": "AWSURL",
                    "isRequired": false,
                    "attributes": []
                },
                "bio": {
                    "name": "bio",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "followerCount": {
                    "name": "followerCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "followingCount": {
                    "name": "followingCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "postCount": {
                    "name": "postCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "hasFullHistory": {
                    "name": "hasFullHistory",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "fullSyncOldestPostDate": {
                    "name": "fullSyncOldestPostDate",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "pageDescription": {
                    "name": "pageDescription",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "category": {
                    "name": "category",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "website": {
                    "name": "website",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "status": {
                    "name": "status",
                    "isArray": false,
                    "type": {
                        "enum": "SocialAccountStatus"
                    },
                    "isRequired": true,
                    "attributes": []
                },
                "isScrapingEnabled": {
                    "name": "isScrapingEnabled",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": true,
                    "attributes": []
                },
                "scrapeFrequencyMinutes": {
                    "name": "scrapeFrequencyMinutes",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "lastScrapedAt": {
                    "name": "lastScrapedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "lastSuccessfulScrapeAt": {
                    "name": "lastSuccessfulScrapeAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "nextScheduledScrapeAt": {
                    "name": "nextScheduledScrapeAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "consecutiveFailures": {
                    "name": "consecutiveFailures",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "lastErrorMessage": {
                    "name": "lastErrorMessage",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "hasPostAccess": {
                    "name": "hasPostAccess",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "accessTokenExpiry": {
                    "name": "accessTokenExpiry",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "permissionsGranted": {
                    "name": "permissionsGranted",
                    "isArray": true,
                    "type": "String",
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
                "posts": {
                    "name": "posts",
                    "isArray": true,
                    "type": {
                        "model": "SocialPost"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true,
                    "association": {
                        "connectionType": "HAS_MANY",
                        "associatedWith": [
                            "socialAccount"
                        ]
                    }
                },
                "scrapeAttempts": {
                    "name": "scrapeAttempts",
                    "isArray": true,
                    "type": {
                        "model": "SocialScrapeAttempt"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true,
                    "association": {
                        "connectionType": "HAS_MANY",
                        "associatedWith": [
                            "socialAccount"
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
                "createdBy": {
                    "name": "createdBy",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                }
            },
            "syncable": true,
            "pluralName": "SocialAccounts",
            "attributes": [
                {
                    "type": "model",
                    "properties": {
                        "subscriptions": null
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byPlatformAccountId",
                        "queryField": "socialAccountByPlatformId",
                        "fields": [
                            "platformAccountId"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byAccountName",
                        "fields": [
                            "accountName"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byAccountLocation",
                        "queryField": "socialAccountsByLocation",
                        "fields": [
                            "businessLocation"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "bySocialAccountEntity",
                        "fields": [
                            "entityId"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "bySocialAccountVenue",
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
                "platformPostId": {
                    "name": "platformPostId",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "postUrl": {
                    "name": "postUrl",
                    "isArray": false,
                    "type": "AWSURL",
                    "isRequired": false,
                    "attributes": []
                },
                "postType": {
                    "name": "postType",
                    "isArray": false,
                    "type": {
                        "enum": "SocialPostType"
                    },
                    "isRequired": true,
                    "attributes": []
                },
                "accountName": {
                    "name": "accountName",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "accountProfileImageUrl": {
                    "name": "accountProfileImageUrl",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "platform": {
                    "name": "platform",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "businessLocation": {
                    "name": "businessLocation",
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
                "contentPreview": {
                    "name": "contentPreview",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "rawContent": {
                    "name": "rawContent",
                    "isArray": false,
                    "type": "AWSJSON",
                    "isRequired": false,
                    "attributes": []
                },
                "mediaUrls": {
                    "name": "mediaUrls",
                    "isArray": true,
                    "type": "AWSURL",
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "thumbnailUrl": {
                    "name": "thumbnailUrl",
                    "isArray": false,
                    "type": "AWSURL",
                    "isRequired": false,
                    "attributes": []
                },
                "mediaType": {
                    "name": "mediaType",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "videoUrl": {
                    "name": "videoUrl",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "videoThumbnailUrl": {
                    "name": "videoThumbnailUrl",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "videoWidth": {
                    "name": "videoWidth",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "videoHeight": {
                    "name": "videoHeight",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "videoTitle": {
                    "name": "videoTitle",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "videoDescription": {
                    "name": "videoDescription",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "likeCount": {
                    "name": "likeCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "commentCount": {
                    "name": "commentCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "shareCount": {
                    "name": "shareCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "reactionCount": {
                    "name": "reactionCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "viewCount": {
                    "name": "viewCount",
                    "isArray": false,
                    "type": "Int",
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
                "scrapedAt": {
                    "name": "scrapedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": true,
                    "attributes": []
                },
                "lastUpdatedAt": {
                    "name": "lastUpdatedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "status": {
                    "name": "status",
                    "isArray": false,
                    "type": {
                        "enum": "SocialPostStatus"
                    },
                    "isRequired": true,
                    "attributes": []
                },
                "isPromotional": {
                    "name": "isPromotional",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "isPinned": {
                    "name": "isPinned",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "isTournamentResult": {
                    "name": "isTournamentResult",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "isTournamentRelated": {
                    "name": "isTournamentRelated",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "tags": {
                    "name": "tags",
                    "isArray": true,
                    "type": "String",
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "sentiment": {
                    "name": "sentiment",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "contentCategory": {
                    "name": "contentCategory",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "linkedGameId": {
                    "name": "linkedGameId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "linkedGame": {
                    "name": "linkedGame",
                    "isArray": false,
                    "type": {
                        "model": "Game"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "association": {
                        "connectionType": "BELONGS_TO",
                        "targetNames": [
                            "linkedGameId"
                        ]
                    }
                },
                "processingStatus": {
                    "name": "processingStatus",
                    "isArray": false,
                    "type": {
                        "enum": "SocialPostProcessingStatus"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "processedAt": {
                    "name": "processedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "processingError": {
                    "name": "processingError",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "processingVersion": {
                    "name": "processingVersion",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "contentType": {
                    "name": "contentType",
                    "isArray": false,
                    "type": {
                        "enum": "SocialPostContentType"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "contentTypeConfidence": {
                    "name": "contentTypeConfidence",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "extractedGameDataId": {
                    "name": "extractedGameDataId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "extractedGameData": {
                    "name": "extractedGameData",
                    "isArray": false,
                    "type": {
                        "model": "SocialPostGameData"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "association": {
                        "connectionType": "HAS_ONE",
                        "associatedWith": [
                            "id"
                        ],
                        "targetNames": [
                            "extractedGameDataId"
                        ]
                    }
                },
                "gameLinks": {
                    "name": "gameLinks",
                    "isArray": true,
                    "type": {
                        "model": "SocialPostGameLink"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true,
                    "association": {
                        "connectionType": "HAS_MANY",
                        "associatedWith": [
                            "socialPostId"
                        ]
                    }
                },
                "primaryLinkedGameId": {
                    "name": "primaryLinkedGameId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "linkedGameCount": {
                    "name": "linkedGameCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "hasUnverifiedLinks": {
                    "name": "hasUnverifiedLinks",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "postYearMonth": {
                    "name": "postYearMonth",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "effectiveGameDate": {
                    "name": "effectiveGameDate",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "effectiveGameDateSource": {
                    "name": "effectiveGameDateSource",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "socialAccountId": {
                    "name": "socialAccountId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "socialAccount": {
                    "name": "socialAccount",
                    "isArray": false,
                    "type": {
                        "model": "SocialAccount"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "association": {
                        "connectionType": "BELONGS_TO",
                        "targetNames": [
                            "socialAccountId"
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
                "venueId": {
                    "name": "venueId",
                    "isArray": false,
                    "type": "ID",
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
            "pluralName": "SocialPosts",
            "attributes": [
                {
                    "type": "model",
                    "properties": {
                        "subscriptions": null
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byPlatformPostId",
                        "queryField": "socialPostByPlatformId",
                        "fields": [
                            "platformPostId"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byPostLocation",
                        "queryField": "socialPostsByLocation",
                        "fields": [
                            "businessLocation",
                            "postedAt"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byPostedAt",
                        "fields": [
                            "postedAt",
                            "likeCount"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byPostStatus",
                        "queryField": "socialPostsByPostStatus",
                        "fields": [
                            "status",
                            "postedAt"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "bySocialPostGame",
                        "fields": [
                            "linkedGameId"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byProcessingStatus",
                        "fields": [
                            "processingStatus",
                            "postedAt"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byPostMonth",
                        "fields": [
                            "postYearMonth",
                            "postedAt"
                        ]
                    }
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
                    "type": "key",
                    "properties": {
                        "name": "bySocialPostEntity",
                        "fields": [
                            "entityId",
                            "postedAt"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "bySocialPostVenue",
                        "fields": [
                            "venueId",
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
        "SocialScrapeAttempt": {
            "name": "SocialScrapeAttempt",
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
                        "enum": "SocialScrapeStatus"
                    },
                    "isRequired": true,
                    "attributes": []
                },
                "startedAt": {
                    "name": "startedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": true,
                    "attributes": []
                },
                "completedAt": {
                    "name": "completedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "durationMs": {
                    "name": "durationMs",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "syncType": {
                    "name": "syncType",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "postsFound": {
                    "name": "postsFound",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "newPostsAdded": {
                    "name": "newPostsAdded",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "postsUpdated": {
                    "name": "postsUpdated",
                    "isArray": false,
                    "type": "Int",
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
                "errorCode": {
                    "name": "errorCode",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "triggerSource": {
                    "name": "triggerSource",
                    "isArray": false,
                    "type": {
                        "enum": "ScraperJobTriggerSource"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "triggeredBy": {
                    "name": "triggeredBy",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "socialAccountId": {
                    "name": "socialAccountId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "socialAccount": {
                    "name": "socialAccount",
                    "isArray": false,
                    "type": {
                        "model": "SocialAccount"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "association": {
                        "connectionType": "BELONGS_TO",
                        "targetNames": [
                            "socialAccountId"
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
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                }
            },
            "syncable": true,
            "pluralName": "SocialScrapeAttempts",
            "attributes": [
                {
                    "type": "model",
                    "properties": {
                        "subscriptions": null
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "bySocialAccountAttempt",
                        "fields": [
                            "socialAccountId",
                            "startedAt"
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
        "SocialScheduledPost": {
            "name": "SocialScheduledPost",
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
                "mediaUrls": {
                    "name": "mediaUrls",
                    "isArray": true,
                    "type": "AWSURL",
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "linkUrl": {
                    "name": "linkUrl",
                    "isArray": false,
                    "type": "AWSURL",
                    "isRequired": false,
                    "attributes": []
                },
                "scheduledFor": {
                    "name": "scheduledFor",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": true,
                    "attributes": []
                },
                "publishedAt": {
                    "name": "publishedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "status": {
                    "name": "status",
                    "isArray": false,
                    "type": {
                        "enum": "ScheduledPostStatus"
                    },
                    "isRequired": true,
                    "attributes": []
                },
                "targetAccountIds": {
                    "name": "targetAccountIds",
                    "isArray": true,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": [],
                    "isArrayNullable": false
                },
                "linkedGameId": {
                    "name": "linkedGameId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "templateType": {
                    "name": "templateType",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "entityId": {
                    "name": "entityId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "createdBy": {
                    "name": "createdBy",
                    "isArray": false,
                    "type": "String",
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
                }
            },
            "syncable": true,
            "pluralName": "SocialScheduledPosts",
            "attributes": [
                {
                    "type": "model",
                    "properties": {
                        "subscriptions": null
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byScheduledTime",
                        "fields": [
                            "scheduledFor"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byScheduledPostStatus",
                        "fields": [
                            "status",
                            "scheduledFor"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byScheduledPostGame",
                        "fields": [
                            "linkedGameId"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byScheduledPostEntity",
                        "fields": [
                            "entityId",
                            "scheduledFor"
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
        "SocialPostGameLink": {
            "name": "SocialPostGameLink",
            "fields": {
                "id": {
                    "name": "id",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "socialPostId": {
                    "name": "socialPostId",
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
                "linkType": {
                    "name": "linkType",
                    "isArray": false,
                    "type": {
                        "enum": "SocialPostLinkType"
                    },
                    "isRequired": true,
                    "attributes": []
                },
                "matchConfidence": {
                    "name": "matchConfidence",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": true,
                    "attributes": []
                },
                "matchReason": {
                    "name": "matchReason",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "matchSignals": {
                    "name": "matchSignals",
                    "isArray": false,
                    "type": "AWSJSON",
                    "isRequired": false,
                    "attributes": []
                },
                "isPrimaryGame": {
                    "name": "isPrimaryGame",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "mentionOrder": {
                    "name": "mentionOrder",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "extractedVenueName": {
                    "name": "extractedVenueName",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "extractedDate": {
                    "name": "extractedDate",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "extractedBuyIn": {
                    "name": "extractedBuyIn",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "extractedGuarantee": {
                    "name": "extractedGuarantee",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "effectiveGameDate": {
                    "name": "effectiveGameDate",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "socialPostGameDataId": {
                    "name": "socialPostGameDataId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "hasTicketData": {
                    "name": "hasTicketData",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "ticketData": {
                    "name": "ticketData",
                    "isArray": false,
                    "type": "AWSJSON",
                    "isRequired": false,
                    "attributes": []
                },
                "reconciliationPreview": {
                    "name": "reconciliationPreview",
                    "isArray": false,
                    "type": "AWSJSON",
                    "isRequired": false,
                    "attributes": []
                },
                "hasReconciliationDiscrepancy": {
                    "name": "hasReconciliationDiscrepancy",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "reconciliationDiscrepancySeverity": {
                    "name": "reconciliationDiscrepancySeverity",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "extractedWinnerName": {
                    "name": "extractedWinnerName",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "extractedWinnerPrize": {
                    "name": "extractedWinnerPrize",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "extractedTotalEntries": {
                    "name": "extractedTotalEntries",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "placementCount": {
                    "name": "placementCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "contentType": {
                    "name": "contentType",
                    "isArray": false,
                    "type": {
                        "enum": "SocialPostContentType"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "linkedAt": {
                    "name": "linkedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": true,
                    "attributes": []
                },
                "linkedBy": {
                    "name": "linkedBy",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "verifiedAt": {
                    "name": "verifiedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "verifiedBy": {
                    "name": "verifiedBy",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "rejectedAt": {
                    "name": "rejectedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "rejectedBy": {
                    "name": "rejectedBy",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "rejectionReason": {
                    "name": "rejectionReason",
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
            "pluralName": "SocialPostGameLinks",
            "attributes": [
                {
                    "type": "model",
                    "properties": {
                        "subscriptions": null
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "bySocialPostGameLink",
                        "fields": [
                            "socialPostId",
                            "matchConfidence"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byGameSocialPostLink",
                        "fields": [
                            "gameId",
                            "linkedAt"
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
        "SocialPostGameData": {
            "name": "SocialPostGameData",
            "fields": {
                "id": {
                    "name": "id",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "socialPostId": {
                    "name": "socialPostId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "contentType": {
                    "name": "contentType",
                    "isArray": false,
                    "type": {
                        "enum": "SocialPostContentType"
                    },
                    "isRequired": true,
                    "attributes": []
                },
                "contentTypeConfidence": {
                    "name": "contentTypeConfidence",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "resultScore": {
                    "name": "resultScore",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "promoScore": {
                    "name": "promoScore",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "extractedName": {
                    "name": "extractedName",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "extractedTournamentUrl": {
                    "name": "extractedTournamentUrl",
                    "isArray": false,
                    "type": "AWSURL",
                    "isRequired": false,
                    "attributes": []
                },
                "extractedTournamentId": {
                    "name": "extractedTournamentId",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "extractedVenueName": {
                    "name": "extractedVenueName",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "extractedVenueId": {
                    "name": "extractedVenueId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "suggestedVenueId": {
                    "name": "suggestedVenueId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "venueMatchConfidence": {
                    "name": "venueMatchConfidence",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "venueMatchReason": {
                    "name": "venueMatchReason",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "venueMatchSource": {
                    "name": "venueMatchSource",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "extractedDate": {
                    "name": "extractedDate",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "extractedDayOfWeek": {
                    "name": "extractedDayOfWeek",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "extractedStartTime": {
                    "name": "extractedStartTime",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "dateSource": {
                    "name": "dateSource",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "effectiveGameDate": {
                    "name": "effectiveGameDate",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "effectiveGameDateSource": {
                    "name": "effectiveGameDateSource",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "extractedBuyIn": {
                    "name": "extractedBuyIn",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "extractedGuarantee": {
                    "name": "extractedGuarantee",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "extractedPrizePool": {
                    "name": "extractedPrizePool",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "extractedFirstPlacePrize": {
                    "name": "extractedFirstPlacePrize",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "extractedTotalPrizesPaid": {
                    "name": "extractedTotalPrizesPaid",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "extractedRake": {
                    "name": "extractedRake",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "extractedTotalEntries": {
                    "name": "extractedTotalEntries",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "extractedTotalUniquePlayers": {
                    "name": "extractedTotalUniquePlayers",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "extractedGameType": {
                    "name": "extractedGameType",
                    "isArray": false,
                    "type": {
                        "enum": "GameType"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "extractedTournamentType": {
                    "name": "extractedTournamentType",
                    "isArray": false,
                    "type": {
                        "enum": "TournamentType"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "extractedGameVariant": {
                    "name": "extractedGameVariant",
                    "isArray": false,
                    "type": {
                        "enum": "GameVariant"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "extractedGameTypes": {
                    "name": "extractedGameTypes",
                    "isArray": true,
                    "type": "String",
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "extractedRecurringGameName": {
                    "name": "extractedRecurringGameName",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "extractedSeriesName": {
                    "name": "extractedSeriesName",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "extractedEventNumber": {
                    "name": "extractedEventNumber",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "extractedDayNumber": {
                    "name": "extractedDayNumber",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "extractedFlightLetter": {
                    "name": "extractedFlightLetter",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "isSeriesEvent": {
                    "name": "isSeriesEvent",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "extractedWinnerName": {
                    "name": "extractedWinnerName",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "extractedWinnerPrize": {
                    "name": "extractedWinnerPrize",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "extractedWinnerHasTicket": {
                    "name": "extractedWinnerHasTicket",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "extractedWinnerTicketType": {
                    "name": "extractedWinnerTicketType",
                    "isArray": false,
                    "type": {
                        "enum": "NonCashPrizeType"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "extractedWinnerTicketValue": {
                    "name": "extractedWinnerTicketValue",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "extractedWinnerTotalValue": {
                    "name": "extractedWinnerTotalValue",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "placementCount": {
                    "name": "placementCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "totalTicketsExtracted": {
                    "name": "totalTicketsExtracted",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "totalTicketValue": {
                    "name": "totalTicketValue",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "ticketCountByType": {
                    "name": "ticketCountByType",
                    "isArray": false,
                    "type": "AWSJSON",
                    "isRequired": false,
                    "attributes": []
                },
                "ticketValueByType": {
                    "name": "ticketValueByType",
                    "isArray": false,
                    "type": "AWSJSON",
                    "isRequired": false,
                    "attributes": []
                },
                "totalCashPaid": {
                    "name": "totalCashPaid",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalPrizesWithTickets": {
                    "name": "totalPrizesWithTickets",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "totalTicketOnlyPrizes": {
                    "name": "totalTicketOnlyPrizes",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "hasAdvertisedTickets": {
                    "name": "hasAdvertisedTickets",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "advertisedTicketCount": {
                    "name": "advertisedTicketCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "advertisedTicketType": {
                    "name": "advertisedTicketType",
                    "isArray": false,
                    "type": {
                        "enum": "NonCashPrizeType"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "advertisedTicketValue": {
                    "name": "advertisedTicketValue",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "advertisedTicketDescription": {
                    "name": "advertisedTicketDescription",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "advertisedTickets": {
                    "name": "advertisedTickets",
                    "isArray": false,
                    "type": "AWSJSON",
                    "isRequired": false,
                    "attributes": []
                },
                "reconciliation_accumulatorTicketCount": {
                    "name": "reconciliation_accumulatorTicketCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "reconciliation_accumulatorTicketValue": {
                    "name": "reconciliation_accumulatorTicketValue",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "reconciliation_totalPrizepoolPaid": {
                    "name": "reconciliation_totalPrizepoolPaid",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "reconciliation_cashPlusTotalTicketValue": {
                    "name": "reconciliation_cashPlusTotalTicketValue",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "hasReconciliationDiscrepancy": {
                    "name": "hasReconciliationDiscrepancy",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "reconciliationNotes": {
                    "name": "reconciliationNotes",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "reconciliationCheckedAt": {
                    "name": "reconciliationCheckedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "suggestedGameId": {
                    "name": "suggestedGameId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "matchCandidateCount": {
                    "name": "matchCandidateCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "matchCandidates": {
                    "name": "matchCandidates",
                    "isArray": false,
                    "type": "AWSJSON",
                    "isRequired": false,
                    "attributes": []
                },
                "patternMatches": {
                    "name": "patternMatches",
                    "isArray": false,
                    "type": "AWSJSON",
                    "isRequired": false,
                    "attributes": []
                },
                "extractedPrizes": {
                    "name": "extractedPrizes",
                    "isArray": false,
                    "type": "AWSJSON",
                    "isRequired": false,
                    "attributes": []
                },
                "extractedAt": {
                    "name": "extractedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": true,
                    "attributes": []
                },
                "extractionVersion": {
                    "name": "extractionVersion",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "extractionDurationMs": {
                    "name": "extractionDurationMs",
                    "isArray": false,
                    "type": "Int",
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
                },
                "placements": {
                    "name": "placements",
                    "isArray": true,
                    "type": {
                        "model": "SocialPostPlacement"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true,
                    "association": {
                        "connectionType": "HAS_MANY",
                        "associatedWith": [
                            "socialPostGameDataId"
                        ]
                    }
                }
            },
            "syncable": true,
            "pluralName": "SocialPostGameData",
            "attributes": [
                {
                    "type": "model",
                    "properties": {
                        "subscriptions": null
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "bySocialPostExtraction",
                        "fields": [
                            "socialPostId",
                            "extractedAt"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byTournamentId",
                        "fields": [
                            "extractedTournamentId"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byEffectiveGameDate",
                        "fields": [
                            "effectiveGameDate",
                            "extractedAt"
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
        "SocialPostPlacement": {
            "name": "SocialPostPlacement",
            "fields": {
                "id": {
                    "name": "id",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "socialPostGameDataId": {
                    "name": "socialPostGameDataId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "socialPostId": {
                    "name": "socialPostId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "place": {
                    "name": "place",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "playerName": {
                    "name": "playerName",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "cashPrize": {
                    "name": "cashPrize",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "cashPrizeRaw": {
                    "name": "cashPrizeRaw",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "hasNonCashPrize": {
                    "name": "hasNonCashPrize",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "nonCashPrizes": {
                    "name": "nonCashPrizes",
                    "isArray": false,
                    "type": "AWSJSON",
                    "isRequired": false,
                    "attributes": []
                },
                "primaryTicketType": {
                    "name": "primaryTicketType",
                    "isArray": false,
                    "type": {
                        "enum": "NonCashPrizeType"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "primaryTicketValue": {
                    "name": "primaryTicketValue",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "primaryTicketDescription": {
                    "name": "primaryTicketDescription",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "ticketCount": {
                    "name": "ticketCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "totalEstimatedValue": {
                    "name": "totalEstimatedValue",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "wasChop": {
                    "name": "wasChop",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "wasICMDeal": {
                    "name": "wasICMDeal",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "chopDetails": {
                    "name": "chopDetails",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "rawText": {
                    "name": "rawText",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "linkedPlayerId": {
                    "name": "linkedPlayerId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "linkedPlayerTicketId": {
                    "name": "linkedPlayerTicketId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "playerLinkConfidence": {
                    "name": "playerLinkConfidence",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "playerLinkMethod": {
                    "name": "playerLinkMethod",
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
            "pluralName": "SocialPostPlacements",
            "attributes": [
                {
                    "type": "model",
                    "properties": {
                        "subscriptions": null
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byGameDataPlacement",
                        "fields": [
                            "socialPostGameDataId",
                            "place"
                        ]
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "bySocialPostPlacement",
                        "fields": [
                            "socialPostId",
                            "place"
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
                "isActive": {
                    "name": "isActive",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "allowedPages": {
                    "name": "allowedPages",
                    "isArray": true,
                    "type": "String",
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "firstName": {
                    "name": "firstName",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "lastName": {
                    "name": "lastName",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "phone": {
                    "name": "phone",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "avatar": {
                    "name": "avatar",
                    "isArray": false,
                    "type": "AWSURL",
                    "isRequired": false,
                    "attributes": []
                },
                "allowedEntityIds": {
                    "name": "allowedEntityIds",
                    "isArray": true,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "allowedVenueIds": {
                    "name": "allowedVenueIds",
                    "isArray": true,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "defaultEntityId": {
                    "name": "defaultEntityId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "lastLoginAt": {
                    "name": "lastLoginAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "lastActiveAt": {
                    "name": "lastActiveAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "passwordLastChangedAt": {
                    "name": "passwordLastChangedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "mustChangePassword": {
                    "name": "mustChangePassword",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "loginAttempts": {
                    "name": "loginAttempts",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "lockedUntil": {
                    "name": "lockedUntil",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "createdBy": {
                    "name": "createdBy",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "updatedBy": {
                    "name": "updatedBy",
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
                "auditLogs": {
                    "name": "auditLogs",
                    "isArray": true,
                    "type": {
                        "model": "UserAuditLog"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true,
                    "association": {
                        "connectionType": "HAS_MANY",
                        "associatedWith": [
                            "user"
                        ]
                    }
                }
            },
            "syncable": true,
            "pluralName": "Users",
            "attributes": [
                {
                    "type": "model",
                    "properties": {
                        "subscriptions": null
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byEmail",
                        "queryField": "userByEmail",
                        "fields": [
                            "email"
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
                                    "read",
                                    "update"
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
                    "properties": {
                        "subscriptions": null
                    }
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
        "UserAuditLog": {
            "name": "UserAuditLog",
            "fields": {
                "id": {
                    "name": "id",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "userId": {
                    "name": "userId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "user": {
                    "name": "user",
                    "isArray": false,
                    "type": {
                        "model": "User"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "association": {
                        "connectionType": "BELONGS_TO",
                        "targetNames": [
                            "userId"
                        ]
                    }
                },
                "action": {
                    "name": "action",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "resource": {
                    "name": "resource",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "details": {
                    "name": "details",
                    "isArray": false,
                    "type": "AWSJSON",
                    "isRequired": false,
                    "attributes": []
                },
                "ipAddress": {
                    "name": "ipAddress",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "userAgent": {
                    "name": "userAgent",
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
                    "isRequired": false,
                    "attributes": [],
                    "isReadOnly": true
                }
            },
            "syncable": true,
            "pluralName": "UserAuditLogs",
            "attributes": [
                {
                    "type": "model",
                    "properties": {
                        "subscriptions": null
                    }
                },
                {
                    "type": "key",
                    "properties": {
                        "name": "byUser",
                        "fields": [
                            "userId",
                            "createdAt"
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
                    "properties": {
                        "subscriptions": null
                    }
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
                    "properties": {
                        "subscriptions": null
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
                "NOT_PUBLISHED",
                "NLHE",
                "PLO",
                "PLOM",
                "PL04",
                "PLOM4",
                "PLOM5",
                "PLO5",
                "PLO6",
                "PLOM6",
                "PLMIXED",
                "PLDC",
                "NLDC"
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
                "REENTRY",
                "RE_ENTRY",
                "REBUY",
                "BOUNTY",
                "KNOCKOUT",
                "SATELLITE",
                "TURBO",
                "HYPERTURBO",
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
                "Churned_91_120d",
                "Churned_121_180d",
                "Churned_181_360d",
                "Churned_361d"
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
        "SeriesCategory": {
            "name": "SeriesCategory",
            "values": [
                "REGULAR",
                "SPECIAL",
                "PROMOTIONAL",
                "CHAMPIONSHIP",
                "SEASONAL"
            ]
        },
        "HolidayType": {
            "name": "HolidayType",
            "values": [
                "NEW_YEAR",
                "AUSTRALIA_DAY",
                "EASTER",
                "ANZAC_DAY",
                "QUEENS_BIRTHDAY",
                "CHRISTMAS",
                "BOXING_DAY",
                "MELBOURNE_CUP",
                "LABOUR_DAY",
                "OTHER"
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
        "SeriesAssignmentStatus": {
            "name": "SeriesAssignmentStatus",
            "values": [
                "AUTO_ASSIGNED",
                "MANUALLY_ASSIGNED",
                "PENDING_ASSIGNMENT",
                "UNASSIGNED",
                "NOT_SERIES"
            ]
        },
        "RecurringGameAssignmentStatus": {
            "name": "RecurringGameAssignmentStatus",
            "values": [
                "AUTO_ASSIGNED",
                "MANUALLY_ASSIGNED",
                "PENDING_ASSIGNMENT",
                "NOT_RECURRING",
                "DEVIATION_FLAGGED"
            ]
        },
        "CostItemType": {
            "name": "CostItemType",
            "values": [
                "DEALER",
                "TOURNAMENT_DIRECTOR",
                "FLOOR_STAFF",
                "SECURITY",
                "PRIZE_CONTRIBUTION",
                "JACKPOT_CONTRIBUTION",
                "GUARANTEE_OVERLAY",
                "ADDED_VALUE",
                "BOUNTY",
                "VENUE_RENTAL",
                "EQUIPMENT_RENTAL",
                "FOOD_BEVERAGE",
                "MARKETING",
                "STREAMING",
                "INSURANCE",
                "LICENSING",
                "STAFF_TRAVEL",
                "PLAYER_ACCOMMODATION",
                "PROMOTION",
                "OTHER"
            ]
        },
        "CostItemRateType": {
            "name": "CostItemRateType",
            "values": [
                "STANDARD",
                "OVERTIME",
                "DOUBLE_TIME",
                "PENALTY",
                "HOLIDAY",
                "SPECIAL",
                "FLAT"
            ]
        },
        "CostStatus": {
            "name": "CostStatus",
            "values": [
                "PENDING",
                "PARTIAL",
                "COMPLETE",
                "ESTIMATED"
            ]
        },
        "SnapshotType": {
            "name": "SnapshotType",
            "values": [
                "AUTO",
                "MANUAL",
                "RECONCILED"
            ]
        },
        "EntryType": {
            "name": "EntryType",
            "values": [
                "INITIAL",
                "REENTRY",
                "DIRECT_BUYIN",
                "QUALIFIED_CONTINUATION",
                "AGGREGATE_LISTING"
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
                "TIMEOUT",
                "STOPPED_TIMEOUT",
                "STOPPED_BLANKS",
                "STOPPED_NOT_FOUND",
                "STOPPED_ERROR",
                "STOPPED_MANUAL",
                "STOPPED_NO_VENUE",
                "STOPPED_MAX_ID"
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
                "ERROR",
                "SKIPPED_DONOTSCRAPE",
                "SKIPPED_VENUE",
                "BLANK",
                "NO_CHANGES",
                "UPDATED",
                "SAVED",
                "SUCCESS_EDITED",
                "SAVED_EDITED",
                "UPDATED_EDITED",
                "NOT_FOUND",
                "NOT_IN_USE",
                "NOT_PUBLISHED"
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
        },
        "ScraperJobMode": {
            "name": "ScraperJobMode",
            "values": [
                "single",
                "bulk",
                "range",
                "gaps",
                "auto",
                "refresh",
                "multiId"
            ]
        },
        "SocialPlatform": {
            "name": "SocialPlatform",
            "values": [
                "FACEBOOK",
                "INSTAGRAM",
                "TWITTER",
                "LINKEDIN"
            ]
        },
        "SocialAccountStatus": {
            "name": "SocialAccountStatus",
            "values": [
                "ACTIVE",
                "INACTIVE",
                "PENDING_VERIFICATION",
                "ERROR",
                "RATE_LIMITED"
            ]
        },
        "SocialPostType": {
            "name": "SocialPostType",
            "values": [
                "TEXT",
                "IMAGE",
                "VIDEO",
                "LINK",
                "EVENT",
                "ALBUM",
                "LIVE"
            ]
        },
        "SocialScrapeStatus": {
            "name": "SocialScrapeStatus",
            "values": [
                "RUNNING",
                "SUCCESS",
                "FAILED",
                "SKIPPED",
                "RATE_LIMITED",
                "TIMEOUT",
                "NO_NEW_CONTENT"
            ]
        },
        "SocialPostStatus": {
            "name": "SocialPostStatus",
            "values": [
                "ACTIVE",
                "HIDDEN",
                "ARCHIVED",
                "DELETED"
            ]
        },
        "ScheduledPostStatus": {
            "name": "ScheduledPostStatus",
            "values": [
                "SCHEDULED",
                "PUBLISHED",
                "FAILED",
                "CANCELLED"
            ]
        },
        "SyncEventStatus": {
            "name": "SyncEventStatus",
            "values": [
                "STARTED",
                "IN_PROGRESS",
                "COMPLETED",
                "RATE_LIMITED",
                "FAILED"
            ]
        },
        "SocialPostContentType": {
            "name": "SocialPostContentType",
            "values": [
                "RESULT",
                "PROMOTIONAL",
                "GENERAL",
                "COMMENT"
            ]
        },
        "SocialPostProcessingStatus": {
            "name": "SocialPostProcessingStatus",
            "values": [
                "PENDING",
                "PROCESSING",
                "EXTRACTED",
                "MATCHED",
                "LINKED",
                "FAILED",
                "SKIPPED",
                "MANUAL_REVIEW",
                "PREVIEW"
            ]
        },
        "SocialPostLinkType": {
            "name": "SocialPostLinkType",
            "values": [
                "AUTO_MATCHED",
                "MANUAL_LINKED",
                "VERIFIED",
                "REJECTED",
                "TOURNAMENT_ID"
            ]
        },
        "NonCashPrizeType": {
            "name": "NonCashPrizeType",
            "values": [
                "ACCUMULATOR_TICKET",
                "SATELLITE_TICKET",
                "BOUNTY_TICKET",
                "TOURNAMENT_ENTRY",
                "SERIES_TICKET",
                "MAIN_EVENT_SEAT",
                "VALUED_SEAT",
                "TRAVEL_PACKAGE",
                "ACCOMMODATION_PACKAGE",
                "VOUCHER",
                "FOOD_CREDIT",
                "CASINO_CREDIT",
                "MERCHANDISE",
                "POINTS",
                "OTHER"
            ]
        },
        "TicketAwardSource": {
            "name": "TicketAwardSource",
            "values": [
                "SOCIAL_POST_RESULT",
                "SOCIAL_POST_PROMO",
                "SCRAPED_DATA",
                "MANUAL_ENTRY",
                "RECURRING_GAME_DEFAULT"
            ]
        },
        "BackgroundTaskType": {
            "name": "BackgroundTaskType",
            "values": [
                "VENUE_REASSIGNMENT",
                "BULK_VENUE_REASSIGNMENT",
                "ENTITY_REASSIGNMENT",
                "VENUE_CLONE",
                "BULK_IMPORT",
                "DATA_MIGRATION",
                "REPORT_GENERATION",
                "VENUE_DETAILS_RECALC",
                "RECURRING_GAME_DETECTION",
                "METRICS_CALCULATION"
            ]
        },
        "BackgroundTaskStatus": {
            "name": "BackgroundTaskStatus",
            "values": [
                "QUEUED",
                "RUNNING",
                "COMPLETED",
                "FAILED",
                "CANCELLED",
                "PARTIAL_SUCCESS"
            ]
        },
        "SeriesResolutionStatus": {
            "name": "SeriesResolutionStatus",
            "values": [
                "MATCHED_EXISTING",
                "CREATED_NEW",
                "NOT_SERIES",
                "SKIPPED",
                "PENDING_REVIEW",
                "FAILED"
            ]
        },
        "RecurringResolutionStatus": {
            "name": "RecurringResolutionStatus",
            "values": [
                "MATCHED_EXISTING",
                "CREATED_NEW",
                "NOT_RECURRING",
                "SKIPPED",
                "PENDING_REVIEW",
                "FAILED"
            ]
        },
        "SessionMode": {
            "name": "SessionMode",
            "values": [
                "CASH",
                "TOURNAMENT"
            ]
        },
        "PokerVariant": {
            "name": "PokerVariant",
            "values": [
                "HOLD_EM",
                "HOLD_EM_SHORT_DECK",
                "OMAHA_HI",
                "OMAHA_HILO",
                "OMAHA5_HI",
                "OMAHA5_HILO",
                "OMAHA6_HI",
                "OMAHA6_HILO",
                "STUD_HI",
                "STUD_HILO",
                "RAZZ",
                "DRAW_2_7_TRIPLE",
                "DRAW_2_7_SINGLE",
                "DRAW_5_CARD",
                "BADUGI",
                "MIXED_HORSE",
                "MIXED_8GAME",
                "MIXED_HOSE",
                "MIXED_RASH",
                "MIXED_DEALERS_CHOICE",
                "MIXED_ROTATION",
                "MIXED_OTHER",
                "COURCHEVEL",
                "IRISH",
                "PINEAPPLE",
                "CRAZY_PINEAPPLE",
                "OTHER",
                "NOT_SPECIFIED"
            ]
        },
        "BettingStructure": {
            "name": "BettingStructure",
            "values": [
                "NO_LIMIT",
                "POT_LIMIT",
                "FIXED_LIMIT",
                "SPREAD_LIMIT",
                "CAP_LIMIT",
                "MIXED_LIMIT"
            ]
        },
        "SpeedType": {
            "name": "SpeedType",
            "values": [
                "SLOW",
                "REGULAR",
                "TURBO",
                "HYPER",
                "SUPER_TURBO"
            ]
        },
        "TableSize": {
            "name": "TableSize",
            "values": [
                "HEADS_UP",
                "SHORT_HANDED",
                "FULL_RING"
            ]
        },
        "DealType": {
            "name": "DealType",
            "values": [
                "LIVE_DEALER",
                "AUTO_SHUFFLER",
                "ELECTRONIC",
                "SELF_DEALT"
            ]
        },
        "BuyInTier": {
            "name": "BuyInTier",
            "values": [
                "FREEROLL",
                "MICRO",
                "LOW",
                "MID",
                "HIGH",
                "SUPER_HIGH",
                "ULTRA_HIGH"
            ]
        },
        "EntryStructure": {
            "name": "EntryStructure",
            "values": [
                "FREEZEOUT",
                "SINGLE_REBUY",
                "UNLIMITED_REBUY",
                "RE_ENTRY",
                "UNLIMITED_RE_ENTRY",
                "ADD_ON_ONLY",
                "REBUY_ADDON"
            ]
        },
        "BountyType": {
            "name": "BountyType",
            "values": [
                "NONE",
                "STANDARD",
                "PROGRESSIVE",
                "MYSTERY",
                "SUPER_KNOCKOUT",
                "TOTAL_KNOCKOUT"
            ]
        },
        "TournamentPurpose": {
            "name": "TournamentPurpose",
            "values": [
                "STANDARD",
                "SATELLITE",
                "MEGA_SATELLITE",
                "SUPER_SATELLITE",
                "QUALIFIER",
                "STEP_SATELLITE",
                "FREEROLL",
                "CHARITY",
                "LEAGUE_POINTS",
                "LAST_LONGER",
                "PROMOTIONAL"
            ]
        },
        "StackDepth": {
            "name": "StackDepth",
            "values": [
                "SHALLOW",
                "STANDARD",
                "DEEP",
                "MEGA",
                "SUPER"
            ]
        },
        "LateRegistration": {
            "name": "LateRegistration",
            "values": [
                "NONE",
                "STANDARD",
                "EXTENDED",
                "UNLIMITED"
            ]
        },
        "PayoutStructure": {
            "name": "PayoutStructure",
            "values": [
                "STANDARD",
                "FLAT",
                "WINNER_TAKE_ALL",
                "FIFTY_FIFTY",
                "TOP_HEAVY",
                "SATELLITE_TICKETS",
                "MILESTONE",
                "PROGRESSIVE"
            ]
        },
        "TournamentScheduleType": {
            "name": "TournamentScheduleType",
            "values": [
                "ONE_OFF",
                "RECURRING",
                "SERIES_EVENT",
                "SPECIAL_EVENT",
                "FESTIVAL_EVENT",
                "AD_HOC"
            ]
        },
        "CashGameType": {
            "name": "CashGameType",
            "values": [
                "STANDARD",
                "CAPPED",
                "UNCAPPED",
                "BOMB_POT",
                "DOUBLE_BOARD",
                "MANDATORY_STRADDLE",
                "STRADDLE_OPTIONAL",
                "ANTE_GAME",
                "MUST_MOVE",
                "SHORT_DECK"
            ]
        },
        "CashRakeType": {
            "name": "CashRakeType",
            "values": [
                "NO_RAKE",
                "POT_PERCENTAGE",
                "POT_PERCENTAGE_CAPPED",
                "TIME_RAKE",
                "JACKPOT_DROP",
                "PROMOTIONAL",
                "SUBSCRIPTION"
            ]
        },
        "MixedGameComponent": {
            "name": "MixedGameComponent",
            "values": [
                "NLHE",
                "LHE",
                "PLO",
                "PLO8",
                "LO8",
                "STUD",
                "STUD8",
                "RAZZ",
                "TRIPLE_DRAW",
                "SINGLE_DRAW",
                "BADUGI",
                "NL_DRAW",
                "COURCHEVEL",
                "SHORT_DECK",
                "BIG_O",
                "OTHER"
            ]
        },
        "ClassificationSource": {
            "name": "ClassificationSource",
            "values": [
                "SCRAPED",
                "DERIVED",
                "INFERRED",
                "INHERITED",
                "MANUAL",
                "MIGRATED"
            ]
        },
        "GameProcessedAction": {
            "name": "GameProcessedAction",
            "values": [
                "CREATED",
                "UPDATED",
                "SKIPPED",
                "ERROR",
                "NOT_FOUND",
                "NOT_PUBLISHED"
            ]
        }
    },
    "nonModels": {
        "VenueMetricsResult": {
            "name": "VenueMetricsResult",
            "fields": {
                "success": {
                    "name": "success",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": true,
                    "attributes": []
                },
                "venuesProcessed": {
                    "name": "venuesProcessed",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "results": {
                    "name": "results",
                    "isArray": true,
                    "type": {
                        "nonModel": "VenueMetricsUpdateResult"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
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
        "VenueMetricsUpdateResult": {
            "name": "VenueMetricsUpdateResult",
            "fields": {
                "venueId": {
                    "name": "venueId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "detailsId": {
                    "name": "detailsId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "success": {
                    "name": "success",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": true,
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
        "VenueMetricsPreview": {
            "name": "VenueMetricsPreview",
            "fields": {
                "success": {
                    "name": "success",
                    "isArray": false,
                    "type": "Boolean",
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
                "currentMetrics": {
                    "name": "currentMetrics",
                    "isArray": false,
                    "type": {
                        "nonModel": "VenueMetricsSnapshot"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "calculatedMetrics": {
                    "name": "calculatedMetrics",
                    "isArray": false,
                    "type": {
                        "nonModel": "VenueMetricsSnapshot"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "wouldChange": {
                    "name": "wouldChange",
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
        "SaveVenueAssignmentInfo": {
            "name": "SaveVenueAssignmentInfo",
            "fields": {
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
                "status": {
                    "name": "status",
                    "isArray": false,
                    "type": {
                        "enum": "VenueAssignmentStatus"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "confidence": {
                    "name": "confidence",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "VenueMetricsSnapshot": {
            "name": "VenueMetricsSnapshot",
            "fields": {
                "totalGamesHeld": {
                    "name": "totalGamesHeld",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "averageUniquePlayersPerGame": {
                    "name": "averageUniquePlayersPerGame",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "averageEntriesPerGame": {
                    "name": "averageEntriesPerGame",
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
                "gamesIncluded": {
                    "name": "gamesIncluded",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "gamesExcluded": {
                    "name": "gamesExcluded",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "exclusionReasons": {
                    "name": "exclusionReasons",
                    "isArray": false,
                    "type": "AWSJSON",
                    "isRequired": false,
                    "attributes": []
                },
                "status": {
                    "name": "status",
                    "isArray": false,
                    "type": {
                        "enum": "VenueStatus"
                    },
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "ConsolidationPreviewResult": {
            "name": "ConsolidationPreviewResult",
            "fields": {
                "willConsolidate": {
                    "name": "willConsolidate",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": true,
                    "attributes": []
                },
                "reason": {
                    "name": "reason",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "consolidation": {
                    "name": "consolidation",
                    "isArray": false,
                    "type": {
                        "nonModel": "ConsolidationDetails"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "warnings": {
                    "name": "warnings",
                    "isArray": true,
                    "type": "String",
                    "isRequired": true,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "detectedPattern": {
                    "name": "detectedPattern",
                    "isArray": false,
                    "type": {
                        "nonModel": "DetectedMultiDayPattern"
                    },
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "ConsolidationDetails": {
            "name": "ConsolidationDetails",
            "fields": {
                "consolidationKey": {
                    "name": "consolidationKey",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "keyStrategy": {
                    "name": "keyStrategy",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "parentExists": {
                    "name": "parentExists",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": true,
                    "attributes": []
                },
                "parentGameId": {
                    "name": "parentGameId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "parentName": {
                    "name": "parentName",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "siblingCount": {
                    "name": "siblingCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "siblings": {
                    "name": "siblings",
                    "isArray": true,
                    "type": {
                        "nonModel": "ConsolidationSibling"
                    },
                    "isRequired": true,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "projectedTotals": {
                    "name": "projectedTotals",
                    "isArray": false,
                    "type": {
                        "nonModel": "ProjectedConsolidationTotals"
                    },
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "ConsolidationSibling": {
            "name": "ConsolidationSibling",
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
                "dayNumber": {
                    "name": "dayNumber",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "flightLetter": {
                    "name": "flightLetter",
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
                "gameStartDateTime": {
                    "name": "gameStartDateTime",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "totalUniquePlayers": {
                    "name": "totalUniquePlayers",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "totalInitialEntries": {
                    "name": "totalInitialEntries",
                    "isArray": false,
                    "type": "Int",
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
                "finalDay": {
                    "name": "finalDay",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "ProjectedConsolidationTotals": {
            "name": "ProjectedConsolidationTotals",
            "fields": {
                "totalUniquePlayers": {
                    "name": "totalUniquePlayers",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "totalInitialEntries": {
                    "name": "totalInitialEntries",
                    "isArray": false,
                    "type": "Int",
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
                "prizepoolPaid": {
                    "name": "prizepoolPaid",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "prizepoolCalculated": {
                    "name": "prizepoolCalculated",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "earliestStart": {
                    "name": "earliestStart",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "latestEnd": {
                    "name": "latestEnd",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "projectedStatus": {
                    "name": "projectedStatus",
                    "isArray": false,
                    "type": {
                        "enum": "GameStatus"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "isPartialData": {
                    "name": "isPartialData",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "missingFlightCount": {
                    "name": "missingFlightCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
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
                "prizepoolPaid": {
                    "name": "prizepoolPaid",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "prizepoolCalculated": {
                    "name": "prizepoolCalculated",
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
                "totalUniquePlayers": {
                    "name": "totalUniquePlayers",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "totalInitialEntries": {
                    "name": "totalInitialEntries",
                    "isArray": false,
                    "type": "Int",
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
        "EntityScrapingStatus": {
            "name": "EntityScrapingStatus",
            "fields": {
                "entityId": {
                    "name": "entityId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "entityName": {
                    "name": "entityName",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "lowestTournamentId": {
                    "name": "lowestTournamentId",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "highestTournamentId": {
                    "name": "highestTournamentId",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "totalGamesStored": {
                    "name": "totalGamesStored",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "unfinishedGameCount": {
                    "name": "unfinishedGameCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "gaps": {
                    "name": "gaps",
                    "isArray": true,
                    "type": {
                        "nonModel": "GapRange"
                    },
                    "isRequired": true,
                    "attributes": [],
                    "isArrayNullable": false
                },
                "gapSummary": {
                    "name": "gapSummary",
                    "isArray": false,
                    "type": {
                        "nonModel": "GapSummary"
                    },
                    "isRequired": true,
                    "attributes": []
                },
                "lastUpdated": {
                    "name": "lastUpdated",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": true,
                    "attributes": []
                },
                "cacheAge": {
                    "name": "cacheAge",
                    "isArray": false,
                    "type": "Int",
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
        "ReassignGameVenueResult": {
            "name": "ReassignGameVenueResult",
            "fields": {
                "success": {
                    "name": "success",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": true,
                    "attributes": []
                },
                "status": {
                    "name": "status",
                    "isArray": false,
                    "type": "String",
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
                "gameId": {
                    "name": "gameId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "taskId": {
                    "name": "taskId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "oldVenueId": {
                    "name": "oldVenueId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "newVenueId": {
                    "name": "newVenueId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "oldEntityId": {
                    "name": "oldEntityId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "newEntityId": {
                    "name": "newEntityId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "venueCloned": {
                    "name": "venueCloned",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "clonedVenueId": {
                    "name": "clonedVenueId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "recordsUpdated": {
                    "name": "recordsUpdated",
                    "isArray": false,
                    "type": "AWSJSON",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "BulkReassignGameVenuesResult": {
            "name": "BulkReassignGameVenuesResult",
            "fields": {
                "success": {
                    "name": "success",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": true,
                    "attributes": []
                },
                "status": {
                    "name": "status",
                    "isArray": false,
                    "type": "String",
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
                "taskId": {
                    "name": "taskId",
                    "isArray": false,
                    "type": "ID",
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
                "newVenueId": {
                    "name": "newVenueId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "reassignEntity": {
                    "name": "reassignEntity",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "SaveGameResult": {
            "name": "SaveGameResult",
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
                    "isRequired": false,
                    "attributes": []
                },
                "action": {
                    "name": "action",
                    "isArray": false,
                    "type": "String",
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
                "warnings": {
                    "name": "warnings",
                    "isArray": true,
                    "type": "String",
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "playerProcessingQueued": {
                    "name": "playerProcessingQueued",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "playerProcessingReason": {
                    "name": "playerProcessingReason",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "venueAssignment": {
                    "name": "venueAssignment",
                    "isArray": false,
                    "type": {
                        "nonModel": "SaveVenueAssignmentInfo"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "seriesAssignment": {
                    "name": "seriesAssignment",
                    "isArray": false,
                    "type": {
                        "nonModel": "SaveSeriesAssignmentInfo"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "recurringGameAssignment": {
                    "name": "recurringGameAssignment",
                    "isArray": false,
                    "type": {
                        "nonModel": "SaveRecurringAssignmentInfo"
                    },
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
                "wasEdited": {
                    "name": "wasEdited",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "SaveRecurringAssignmentInfo": {
            "name": "SaveRecurringAssignmentInfo",
            "fields": {
                "recurringGameId": {
                    "name": "recurringGameId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "recurringGameName": {
                    "name": "recurringGameName",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "status": {
                    "name": "status",
                    "isArray": false,
                    "type": {
                        "enum": "RecurringGameAssignmentStatus"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "confidence": {
                    "name": "confidence",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "wasCreated": {
                    "name": "wasCreated",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "inheritedGuarantee": {
                    "name": "inheritedGuarantee",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "AssignGameResult": {
            "name": "AssignGameResult",
            "fields": {
                "success": {
                    "name": "success",
                    "isArray": false,
                    "type": "Boolean",
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
                    "attributes": []
                },
                "recurringGame": {
                    "name": "recurringGame",
                    "isArray": false,
                    "type": {
                        "model": "RecurringGame"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "message": {
                    "name": "message",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "confidence": {
                    "name": "confidence",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "DetectRecurringGamesResult": {
            "name": "DetectRecurringGamesResult",
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
                "gamesAnalyzed": {
                    "name": "gamesAnalyzed",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "recurringGamesCreated": {
                    "name": "recurringGamesCreated",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "recurringGamesUpdated": {
                    "name": "recurringGamesUpdated",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "gamesAssigned": {
                    "name": "gamesAssigned",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "gamesPendingReview": {
                    "name": "gamesPendingReview",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "newRecurringGames": {
                    "name": "newRecurringGames",
                    "isArray": true,
                    "type": {
                        "model": "RecurringGame"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "assignmentResults": {
                    "name": "assignmentResults",
                    "isArray": true,
                    "type": {
                        "nonModel": "AssignGameResult"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "preview": {
                    "name": "preview",
                    "isArray": false,
                    "type": "AWSJSON",
                    "isRequired": false,
                    "attributes": []
                },
                "errors": {
                    "name": "errors",
                    "isArray": true,
                    "type": "String",
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                }
            }
        },
        "BulkAssignResult": {
            "name": "BulkAssignResult",
            "fields": {
                "success": {
                    "name": "success",
                    "isArray": false,
                    "type": "Boolean",
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
                "successfulAssignments": {
                    "name": "successfulAssignments",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "failedAssignments": {
                    "name": "failedAssignments",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "results": {
                    "name": "results",
                    "isArray": true,
                    "type": {
                        "nonModel": "AssignGameResult"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "errors": {
                    "name": "errors",
                    "isArray": true,
                    "type": "String",
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                }
            }
        },
        "RecurringGameWithStats": {
            "name": "RecurringGameWithStats",
            "fields": {
                "recurringGame": {
                    "name": "recurringGame",
                    "isArray": false,
                    "type": {
                        "model": "RecurringGame"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "totalInstances": {
                    "name": "totalInstances",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "avgEntries": {
                    "name": "avgEntries",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "avgProfit": {
                    "name": "avgProfit",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "recentTrend": {
                    "name": "recentTrend",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "recentGames": {
                    "name": "recentGames",
                    "isArray": true,
                    "type": {
                        "model": "Game"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "consistency": {
                    "name": "consistency",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "profitability": {
                    "name": "profitability",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "attendanceHealth": {
                    "name": "attendanceHealth",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "topPlayers": {
                    "name": "topPlayers",
                    "isArray": true,
                    "type": {
                        "nonModel": "RecurringGamePlayerSummary"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                }
            }
        },
        "RecurringGamePlayerSummary": {
            "name": "RecurringGamePlayerSummary",
            "fields": {
                "playerId": {
                    "name": "playerId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "playerName": {
                    "name": "playerName",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "appearances": {
                    "name": "appearances",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "avgFinish": {
                    "name": "avgFinish",
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
                }
            }
        },
        "SearchRecurringGamesResult": {
            "name": "SearchRecurringGamesResult",
            "fields": {
                "items": {
                    "name": "items",
                    "isArray": true,
                    "type": {
                        "model": "RecurringGame"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "total": {
                    "name": "total",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
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
        "EnrichGameDataOutput": {
            "name": "EnrichGameDataOutput",
            "fields": {
                "success": {
                    "name": "success",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": true,
                    "attributes": []
                },
                "validation": {
                    "name": "validation",
                    "isArray": false,
                    "type": {
                        "nonModel": "EnrichmentValidationResult"
                    },
                    "isRequired": true,
                    "attributes": []
                },
                "enrichedGame": {
                    "name": "enrichedGame",
                    "isArray": false,
                    "type": {
                        "nonModel": "EnrichedGameData"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "enrichmentMetadata": {
                    "name": "enrichmentMetadata",
                    "isArray": false,
                    "type": {
                        "nonModel": "EnrichmentMetadata"
                    },
                    "isRequired": true,
                    "attributes": []
                },
                "saveResult": {
                    "name": "saveResult",
                    "isArray": false,
                    "type": {
                        "nonModel": "SaveGameResult"
                    },
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "EnrichmentValidationResult": {
            "name": "EnrichmentValidationResult",
            "fields": {
                "isValid": {
                    "name": "isValid",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": true,
                    "attributes": []
                },
                "errors": {
                    "name": "errors",
                    "isArray": true,
                    "type": {
                        "nonModel": "EnrichmentValidationError"
                    },
                    "isRequired": true,
                    "attributes": [],
                    "isArrayNullable": false
                },
                "warnings": {
                    "name": "warnings",
                    "isArray": true,
                    "type": {
                        "nonModel": "EnrichmentValidationWarning"
                    },
                    "isRequired": true,
                    "attributes": [],
                    "isArrayNullable": false
                }
            }
        },
        "EnrichmentValidationError": {
            "name": "EnrichmentValidationError",
            "fields": {
                "field": {
                    "name": "field",
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
                "code": {
                    "name": "code",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "EnrichmentValidationWarning": {
            "name": "EnrichmentValidationWarning",
            "fields": {
                "field": {
                    "name": "field",
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
                "code": {
                    "name": "code",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "EnrichedGameData": {
            "name": "EnrichedGameData",
            "fields": {
                "tournamentId": {
                    "name": "tournamentId",
                    "isArray": false,
                    "type": "Int",
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
                    "isRequired": false,
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
                "registrationStatus": {
                    "name": "registrationStatus",
                    "isArray": false,
                    "type": {
                        "enum": "RegistrationStatus"
                    },
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
                "gameEndDateTime": {
                    "name": "gameEndDateTime",
                    "isArray": false,
                    "type": "AWSDateTime",
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
                "venueFee": {
                    "name": "venueFee",
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
                "totalBuyInsCollected": {
                    "name": "totalBuyInsCollected",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "rakeRevenue": {
                    "name": "rakeRevenue",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "prizepoolPlayerContributions": {
                    "name": "prizepoolPlayerContributions",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "prizepoolAddedValue": {
                    "name": "prizepoolAddedValue",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "prizepoolSurplus": {
                    "name": "prizepoolSurplus",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "guaranteeOverlayCost": {
                    "name": "guaranteeOverlayCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "gameProfit": {
                    "name": "gameProfit",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "prizepoolCalculated": {
                    "name": "prizepoolCalculated",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "hasJackpotContributions": {
                    "name": "hasJackpotContributions",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "jackpotContributionAmount": {
                    "name": "jackpotContributionAmount",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "hasAccumulatorTickets": {
                    "name": "hasAccumulatorTickets",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "accumulatorTicketValue": {
                    "name": "accumulatorTicketValue",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "numberOfAccumulatorTicketsPaid": {
                    "name": "numberOfAccumulatorTicketsPaid",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "totalUniquePlayers": {
                    "name": "totalUniquePlayers",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "totalInitialEntries": {
                    "name": "totalInitialEntries",
                    "isArray": false,
                    "type": "Int",
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
                "prizepoolPaid": {
                    "name": "prizepoolPaid",
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
                "totalDuration": {
                    "name": "totalDuration",
                    "isArray": false,
                    "type": "String",
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
                "isSeries": {
                    "name": "isSeries",
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
                "isSatellite": {
                    "name": "isSatellite",
                    "isArray": false,
                    "type": "Boolean",
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
                "gameTags": {
                    "name": "gameTags",
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
                "venueAssignmentConfidence": {
                    "name": "venueAssignmentConfidence",
                    "isArray": false,
                    "type": "Float",
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
                "tournamentSeriesId": {
                    "name": "tournamentSeriesId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "seriesTitleId": {
                    "name": "seriesTitleId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "seriesAssignmentStatus": {
                    "name": "seriesAssignmentStatus",
                    "isArray": false,
                    "type": {
                        "enum": "SeriesAssignmentStatus"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "seriesAssignmentConfidence": {
                    "name": "seriesAssignmentConfidence",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "suggestedSeriesName": {
                    "name": "suggestedSeriesName",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "isMainEvent": {
                    "name": "isMainEvent",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "eventNumber": {
                    "name": "eventNumber",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "dayNumber": {
                    "name": "dayNumber",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "flightLetter": {
                    "name": "flightLetter",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "finalDay": {
                    "name": "finalDay",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "recurringGameId": {
                    "name": "recurringGameId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "recurringGameAssignmentStatus": {
                    "name": "recurringGameAssignmentStatus",
                    "isArray": false,
                    "type": {
                        "enum": "RecurringGameAssignmentStatus"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "recurringGameAssignmentConfidence": {
                    "name": "recurringGameAssignmentConfidence",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "wasScheduledInstance": {
                    "name": "wasScheduledInstance",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "deviationNotes": {
                    "name": "deviationNotes",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "instanceNumber": {
                    "name": "instanceNumber",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "gameDayOfWeek": {
                    "name": "gameDayOfWeek",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "buyInBucket": {
                    "name": "buyInBucket",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "venueScheduleKey": {
                    "name": "venueScheduleKey",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "venueGameTypeKey": {
                    "name": "venueGameTypeKey",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "entityQueryKey": {
                    "name": "entityQueryKey",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "entityGameTypeKey": {
                    "name": "entityGameTypeKey",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "levels": {
                    "name": "levels",
                    "isArray": false,
                    "type": "AWSJSON",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "EnrichmentMetadata": {
            "name": "EnrichmentMetadata",
            "fields": {
                "seriesResolution": {
                    "name": "seriesResolution",
                    "isArray": false,
                    "type": {
                        "nonModel": "SeriesResolutionMetadata"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "recurringResolution": {
                    "name": "recurringResolution",
                    "isArray": false,
                    "type": {
                        "nonModel": "RecurringResolutionMetadata"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "venueResolution": {
                    "name": "venueResolution",
                    "isArray": false,
                    "type": {
                        "nonModel": "VenueResolutionMetadata"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "queryKeysGenerated": {
                    "name": "queryKeysGenerated",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": true,
                    "attributes": []
                },
                "financialsCalculated": {
                    "name": "financialsCalculated",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": true,
                    "attributes": []
                },
                "fieldsCompleted": {
                    "name": "fieldsCompleted",
                    "isArray": true,
                    "type": "String",
                    "isRequired": true,
                    "attributes": [],
                    "isArrayNullable": false
                },
                "processingTimeMs": {
                    "name": "processingTimeMs",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "SeriesResolutionMetadata": {
            "name": "SeriesResolutionMetadata",
            "fields": {
                "status": {
                    "name": "status",
                    "isArray": false,
                    "type": {
                        "enum": "SeriesResolutionStatus"
                    },
                    "isRequired": true,
                    "attributes": []
                },
                "confidence": {
                    "name": "confidence",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "matchedSeriesId": {
                    "name": "matchedSeriesId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "matchedSeriesName": {
                    "name": "matchedSeriesName",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "matchedSeriesTitleId": {
                    "name": "matchedSeriesTitleId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "wasCreated": {
                    "name": "wasCreated",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": true,
                    "attributes": []
                },
                "createdSeriesId": {
                    "name": "createdSeriesId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "matchReason": {
                    "name": "matchReason",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "RecurringResolutionMetadata": {
            "name": "RecurringResolutionMetadata",
            "fields": {
                "status": {
                    "name": "status",
                    "isArray": false,
                    "type": {
                        "enum": "RecurringResolutionStatus"
                    },
                    "isRequired": true,
                    "attributes": []
                },
                "confidence": {
                    "name": "confidence",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "matchedRecurringGameId": {
                    "name": "matchedRecurringGameId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "matchedRecurringGameName": {
                    "name": "matchedRecurringGameName",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "wasCreated": {
                    "name": "wasCreated",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": true,
                    "attributes": []
                },
                "createdRecurringGameId": {
                    "name": "createdRecurringGameId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "inheritedFields": {
                    "name": "inheritedFields",
                    "isArray": true,
                    "type": "String",
                    "isRequired": true,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "matchReason": {
                    "name": "matchReason",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "VenueResolutionMetadata": {
            "name": "VenueResolutionMetadata",
            "fields": {
                "status": {
                    "name": "status",
                    "isArray": false,
                    "type": {
                        "enum": "VenueAssignmentStatus"
                    },
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
                "venueName": {
                    "name": "venueName",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "venueFee": {
                    "name": "venueFee",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "confidence": {
                    "name": "confidence",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "matchReason": {
                    "name": "matchReason",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "CalculateGameFinancialsOutput": {
            "name": "CalculateGameFinancialsOutput",
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
                    "isRequired": false,
                    "attributes": []
                },
                "mode": {
                    "name": "mode",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "calculatedCost": {
                    "name": "calculatedCost",
                    "isArray": false,
                    "type": {
                        "nonModel": "GameCostCalculation"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "calculatedSnapshot": {
                    "name": "calculatedSnapshot",
                    "isArray": false,
                    "type": {
                        "nonModel": "GameFinancialSnapshotCalculation"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "summary": {
                    "name": "summary",
                    "isArray": false,
                    "type": {
                        "nonModel": "FinancialsSummary"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "costSaveResult": {
                    "name": "costSaveResult",
                    "isArray": false,
                    "type": {
                        "nonModel": "FinancialsSaveResult"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "snapshotSaveResult": {
                    "name": "snapshotSaveResult",
                    "isArray": false,
                    "type": {
                        "nonModel": "FinancialsSaveResult"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "processingTimeMs": {
                    "name": "processingTimeMs",
                    "isArray": false,
                    "type": "Int",
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
        "GameCostCalculation": {
            "name": "GameCostCalculation",
            "fields": {
                "gameId": {
                    "name": "gameId",
                    "isArray": false,
                    "type": "ID",
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
                "venueId": {
                    "name": "venueId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "gameDate": {
                    "name": "gameDate",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "totalDealerCost": {
                    "name": "totalDealerCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalTournamentDirectorCost": {
                    "name": "totalTournamentDirectorCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalFloorStaffCost": {
                    "name": "totalFloorStaffCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalSecurityCost": {
                    "name": "totalSecurityCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalPrizeContribution": {
                    "name": "totalPrizeContribution",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalJackpotContribution": {
                    "name": "totalJackpotContribution",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalPromotionCost": {
                    "name": "totalPromotionCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalOtherCost": {
                    "name": "totalOtherCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalCost": {
                    "name": "totalCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "dealerRatePerEntry": {
                    "name": "dealerRatePerEntry",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "entriesUsedForCalculation": {
                    "name": "entriesUsedForCalculation",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "GameFinancialSnapshotCalculation": {
            "name": "GameFinancialSnapshotCalculation",
            "fields": {
                "gameId": {
                    "name": "gameId",
                    "isArray": false,
                    "type": "ID",
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
                "venueId": {
                    "name": "venueId",
                    "isArray": false,
                    "type": "ID",
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
                "totalUniquePlayers": {
                    "name": "totalUniquePlayers",
                    "isArray": false,
                    "type": "Int",
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
                "guaranteeAmount": {
                    "name": "guaranteeAmount",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "gameDurationMinutes": {
                    "name": "gameDurationMinutes",
                    "isArray": false,
                    "type": "Int",
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
                "tournamentType": {
                    "name": "tournamentType",
                    "isArray": false,
                    "type": {
                        "enum": "TournamentType"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "totalBuyInsCollected": {
                    "name": "totalBuyInsCollected",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "rakeRevenue": {
                    "name": "rakeRevenue",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "venueFee": {
                    "name": "venueFee",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalRevenue": {
                    "name": "totalRevenue",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "prizepoolPlayerContributions": {
                    "name": "prizepoolPlayerContributions",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "prizepoolAddedValue": {
                    "name": "prizepoolAddedValue",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "prizepoolTotal": {
                    "name": "prizepoolTotal",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "prizepoolSurplus": {
                    "name": "prizepoolSurplus",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "prizepoolPaidDelta": {
                    "name": "prizepoolPaidDelta",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "prizepoolJackpotContributions": {
                    "name": "prizepoolJackpotContributions",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "prizepoolAccumulatorTicketPayoutEstimate": {
                    "name": "prizepoolAccumulatorTicketPayoutEstimate",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "prizepoolAccumulatorTicketPayoutActual": {
                    "name": "prizepoolAccumulatorTicketPayoutActual",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "guaranteeOverlayCost": {
                    "name": "guaranteeOverlayCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "guaranteeCoverageRate": {
                    "name": "guaranteeCoverageRate",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "guaranteeMet": {
                    "name": "guaranteeMet",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "totalCost": {
                    "name": "totalCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalDealerCost": {
                    "name": "totalDealerCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalStaffCost": {
                    "name": "totalStaffCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "gameProfit": {
                    "name": "gameProfit",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "netProfit": {
                    "name": "netProfit",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "profitMargin": {
                    "name": "profitMargin",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "revenuePerPlayer": {
                    "name": "revenuePerPlayer",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "costPerPlayer": {
                    "name": "costPerPlayer",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "profitPerPlayer": {
                    "name": "profitPerPlayer",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "rakePerEntry": {
                    "name": "rakePerEntry",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "staffCostPerPlayer": {
                    "name": "staffCostPerPlayer",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "dealerCostPerHour": {
                    "name": "dealerCostPerHour",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "FinancialsSummary": {
            "name": "FinancialsSummary",
            "fields": {
                "totalRevenue": {
                    "name": "totalRevenue",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "rakeRevenue": {
                    "name": "rakeRevenue",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalBuyInsCollected": {
                    "name": "totalBuyInsCollected",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalCost": {
                    "name": "totalCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalDealerCost": {
                    "name": "totalDealerCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "prizepoolTotal": {
                    "name": "prizepoolTotal",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "prizepoolPlayerContributions": {
                    "name": "prizepoolPlayerContributions",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "prizepoolAddedValue": {
                    "name": "prizepoolAddedValue",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "guaranteeMet": {
                    "name": "guaranteeMet",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "guaranteeOverlayCost": {
                    "name": "guaranteeOverlayCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "guaranteeCoverageRate": {
                    "name": "guaranteeCoverageRate",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "gameProfit": {
                    "name": "gameProfit",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "netProfit": {
                    "name": "netProfit",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "profitMargin": {
                    "name": "profitMargin",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "revenuePerPlayer": {
                    "name": "revenuePerPlayer",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "costPerPlayer": {
                    "name": "costPerPlayer",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "profitPerPlayer": {
                    "name": "profitPerPlayer",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "rakePerEntry": {
                    "name": "rakePerEntry",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "FinancialsSaveResult": {
            "name": "FinancialsSaveResult",
            "fields": {
                "action": {
                    "name": "action",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "costId": {
                    "name": "costId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "snapshotId": {
                    "name": "snapshotId",
                    "isArray": false,
                    "type": "ID",
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
        "GameDeletionCounts": {
            "name": "GameDeletionCounts",
            "fields": {
                "deleted": {
                    "name": "deleted",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "error": {
                    "name": "error",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "success": {
                    "name": "success",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "PlayerStatsUpdateCounts": {
            "name": "PlayerStatsUpdateCounts",
            "fields": {
                "summariesUpdated": {
                    "name": "summariesUpdated",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "venuesUpdated": {
                    "name": "venuesUpdated",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "GameDeletionDetails": {
            "name": "GameDeletionDetails",
            "fields": {
                "gameCost": {
                    "name": "gameCost",
                    "isArray": false,
                    "type": {
                        "nonModel": "GameDeletionCounts"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "gameFinancialSnapshot": {
                    "name": "gameFinancialSnapshot",
                    "isArray": false,
                    "type": {
                        "nonModel": "GameDeletionCounts"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "scrapeURL": {
                    "name": "scrapeURL",
                    "isArray": false,
                    "type": {
                        "nonModel": "GameDeletionCounts"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "scrapeAttempts": {
                    "name": "scrapeAttempts",
                    "isArray": false,
                    "type": {
                        "nonModel": "GameDeletionCounts"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "playerEntries": {
                    "name": "playerEntries",
                    "isArray": false,
                    "type": {
                        "nonModel": "GameDeletionCounts"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "playerResults": {
                    "name": "playerResults",
                    "isArray": false,
                    "type": {
                        "nonModel": "GameDeletionCounts"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "playerTransactions": {
                    "name": "playerTransactions",
                    "isArray": false,
                    "type": {
                        "nonModel": "GameDeletionCounts"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "playerStats": {
                    "name": "playerStats",
                    "isArray": false,
                    "type": {
                        "nonModel": "PlayerStatsUpdateCounts"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "game": {
                    "name": "game",
                    "isArray": false,
                    "type": {
                        "nonModel": "GameDeletionCounts"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "parentGame": {
                    "name": "parentGame",
                    "isArray": false,
                    "type": {
                        "nonModel": "DeleteGameWithCleanupResult"
                    },
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "ConsolidationCleanupResult": {
            "name": "ConsolidationCleanupResult",
            "fields": {
                "deleteParent": {
                    "name": "deleteParent",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "parentId": {
                    "name": "parentId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "remainingSiblings": {
                    "name": "remainingSiblings",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "childrenUnlinked": {
                    "name": "childrenUnlinked",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "noConsolidation": {
                    "name": "noConsolidation",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "DeleteGameWithCleanupResult": {
            "name": "DeleteGameWithCleanupResult",
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
                "error": {
                    "name": "error",
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
                "entityId": {
                    "name": "entityId",
                    "isArray": false,
                    "type": "ID",
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
                "dryRun": {
                    "name": "dryRun",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "deletions": {
                    "name": "deletions",
                    "isArray": false,
                    "type": {
                        "nonModel": "GameDeletionDetails"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "consolidation": {
                    "name": "consolidation",
                    "isArray": false,
                    "type": {
                        "nonModel": "ConsolidationCleanupResult"
                    },
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "AwardTicketResult": {
            "name": "AwardTicketResult",
            "fields": {
                "success": {
                    "name": "success",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": true,
                    "attributes": []
                },
                "ticketId": {
                    "name": "ticketId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "playerId": {
                    "name": "playerId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "ticketValue": {
                    "name": "ticketValue",
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
        "BulkAwardTicketsResult": {
            "name": "BulkAwardTicketsResult",
            "fields": {
                "success": {
                    "name": "success",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": true,
                    "attributes": []
                },
                "totalAwarded": {
                    "name": "totalAwarded",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "totalFailed": {
                    "name": "totalFailed",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "results": {
                    "name": "results",
                    "isArray": true,
                    "type": {
                        "nonModel": "AwardTicketResult"
                    },
                    "isRequired": true,
                    "attributes": [],
                    "isArrayNullable": false
                }
            }
        },
        "TicketAwardSummary": {
            "name": "TicketAwardSummary",
            "fields": {
                "gameId": {
                    "name": "gameId",
                    "isArray": false,
                    "type": "ID",
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
                "ticketsAwarded": {
                    "name": "ticketsAwarded",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "ticketValue": {
                    "name": "ticketValue",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalTicketValue": {
                    "name": "totalTicketValue",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "programName": {
                    "name": "programName",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "positions": {
                    "name": "positions",
                    "isArray": true,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                }
            }
        },
        "PlayerTicketConnection": {
            "name": "PlayerTicketConnection",
            "fields": {
                "items": {
                    "name": "items",
                    "isArray": true,
                    "type": {
                        "model": "PlayerTicket"
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
        "RefreshAllMetricsResult": {
            "name": "RefreshAllMetricsResult",
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
                "entityMetricsUpdated": {
                    "name": "entityMetricsUpdated",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "venueMetricsUpdated": {
                    "name": "venueMetricsUpdated",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "recurringGameMetricsUpdated": {
                    "name": "recurringGameMetricsUpdated",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "tournamentSeriesMetricsUpdated": {
                    "name": "tournamentSeriesMetricsUpdated",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "entitiesProcessed": {
                    "name": "entitiesProcessed",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "venuesProcessed": {
                    "name": "venuesProcessed",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "recurringGamesProcessed": {
                    "name": "recurringGamesProcessed",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "tournamentSeriesProcessed": {
                    "name": "tournamentSeriesProcessed",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "snapshotsAnalyzed": {
                    "name": "snapshotsAnalyzed",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "bySeriesType": {
                    "name": "bySeriesType",
                    "isArray": false,
                    "type": {
                        "nonModel": "MetricsBySeriesType"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "executionTimeMs": {
                    "name": "executionTimeMs",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "peakMemoryMB": {
                    "name": "peakMemoryMB",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "entityResults": {
                    "name": "entityResults",
                    "isArray": true,
                    "type": {
                        "nonModel": "MetricsUpdateResult"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "venueResults": {
                    "name": "venueResults",
                    "isArray": true,
                    "type": {
                        "nonModel": "MetricsUpdateResult"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "recurringGameResults": {
                    "name": "recurringGameResults",
                    "isArray": true,
                    "type": {
                        "nonModel": "MetricsUpdateResult"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "tournamentSeriesResults": {
                    "name": "tournamentSeriesResults",
                    "isArray": true,
                    "type": {
                        "nonModel": "MetricsUpdateResult"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "errors": {
                    "name": "errors",
                    "isArray": true,
                    "type": "String",
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "warnings": {
                    "name": "warnings",
                    "isArray": true,
                    "type": "String",
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "refreshedAt": {
                    "name": "refreshedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "refreshedBy": {
                    "name": "refreshedBy",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "MetricsBySeriesType": {
            "name": "MetricsBySeriesType",
            "fields": {
                "ALL": {
                    "name": "ALL",
                    "isArray": false,
                    "type": {
                        "nonModel": "SeriesTypeBreakdown"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "SERIES": {
                    "name": "SERIES",
                    "isArray": false,
                    "type": {
                        "nonModel": "SeriesTypeBreakdown"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "REGULAR": {
                    "name": "REGULAR",
                    "isArray": false,
                    "type": {
                        "nonModel": "SeriesTypeBreakdown"
                    },
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "SeriesTypeBreakdown": {
            "name": "SeriesTypeBreakdown",
            "fields": {
                "entity": {
                    "name": "entity",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "venue": {
                    "name": "venue",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "recurringGame": {
                    "name": "recurringGame",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "tournamentSeries": {
                    "name": "tournamentSeries",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "MetricsUpdateResult": {
            "name": "MetricsUpdateResult",
            "fields": {
                "id": {
                    "name": "id",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "name": {
                    "name": "name",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "type": {
                    "name": "type",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "timeRange": {
                    "name": "timeRange",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "seriesType": {
                    "name": "seriesType",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "success": {
                    "name": "success",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "recordsCreated": {
                    "name": "recordsCreated",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "recordsUpdated": {
                    "name": "recordsUpdated",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "error": {
                    "name": "error",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "durationMs": {
                    "name": "durationMs",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "EntityDashboard": {
            "name": "EntityDashboard",
            "fields": {
                "entity": {
                    "name": "entity",
                    "isArray": false,
                    "type": {
                        "model": "Entity"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "metricsAll": {
                    "name": "metricsAll",
                    "isArray": false,
                    "type": {
                        "model": "EntityMetrics"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "metricsSeries": {
                    "name": "metricsSeries",
                    "isArray": false,
                    "type": {
                        "model": "EntityMetrics"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "metricsRegular": {
                    "name": "metricsRegular",
                    "isArray": false,
                    "type": {
                        "model": "EntityMetrics"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "venueBreakdown": {
                    "name": "venueBreakdown",
                    "isArray": true,
                    "type": {
                        "model": "VenueMetrics"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "topRecurringGames": {
                    "name": "topRecurringGames",
                    "isArray": true,
                    "type": {
                        "model": "RecurringGameMetrics"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "topTournamentSeries": {
                    "name": "topTournamentSeries",
                    "isArray": true,
                    "type": {
                        "model": "TournamentSeriesMetrics"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "trends": {
                    "name": "trends",
                    "isArray": false,
                    "type": {
                        "nonModel": "TrendAnalysis"
                    },
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "VenueDashboard": {
            "name": "VenueDashboard",
            "fields": {
                "venue": {
                    "name": "venue",
                    "isArray": false,
                    "type": {
                        "model": "Venue"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "metricsAll": {
                    "name": "metricsAll",
                    "isArray": false,
                    "type": {
                        "model": "VenueMetrics"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "metricsSeries": {
                    "name": "metricsSeries",
                    "isArray": false,
                    "type": {
                        "model": "VenueMetrics"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "metricsRegular": {
                    "name": "metricsRegular",
                    "isArray": false,
                    "type": {
                        "model": "VenueMetrics"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "recurringGameBreakdown": {
                    "name": "recurringGameBreakdown",
                    "isArray": true,
                    "type": {
                        "model": "RecurringGameMetrics"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "tournamentSeriesBreakdown": {
                    "name": "tournamentSeriesBreakdown",
                    "isArray": true,
                    "type": {
                        "model": "TournamentSeriesMetrics"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "recentGames": {
                    "name": "recentGames",
                    "isArray": true,
                    "type": {
                        "model": "Game"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "trends": {
                    "name": "trends",
                    "isArray": false,
                    "type": {
                        "nonModel": "TrendAnalysis"
                    },
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "RecurringGameReport": {
            "name": "RecurringGameReport",
            "fields": {
                "recurringGame": {
                    "name": "recurringGame",
                    "isArray": false,
                    "type": {
                        "model": "RecurringGame"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "metricsAllTime": {
                    "name": "metricsAllTime",
                    "isArray": false,
                    "type": {
                        "model": "RecurringGameMetrics"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "metrics12M": {
                    "name": "metrics12M",
                    "isArray": false,
                    "type": {
                        "model": "RecurringGameMetrics"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "metrics6M": {
                    "name": "metrics6M",
                    "isArray": false,
                    "type": {
                        "model": "RecurringGameMetrics"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "metrics3M": {
                    "name": "metrics3M",
                    "isArray": false,
                    "type": {
                        "model": "RecurringGameMetrics"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "metrics1M": {
                    "name": "metrics1M",
                    "isArray": false,
                    "type": {
                        "model": "RecurringGameMetrics"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "recentInstances": {
                    "name": "recentInstances",
                    "isArray": true,
                    "type": {
                        "model": "Game"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "regularPlayers": {
                    "name": "regularPlayers",
                    "isArray": true,
                    "type": {
                        "model": "PlayerSummary"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "trends": {
                    "name": "trends",
                    "isArray": false,
                    "type": {
                        "nonModel": "TrendAnalysis"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "recommendations": {
                    "name": "recommendations",
                    "isArray": true,
                    "type": "String",
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                }
            }
        },
        "TournamentSeriesReport": {
            "name": "TournamentSeriesReport",
            "fields": {
                "tournamentSeries": {
                    "name": "tournamentSeries",
                    "isArray": false,
                    "type": {
                        "model": "TournamentSeries"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "metricsAllTime": {
                    "name": "metricsAllTime",
                    "isArray": false,
                    "type": {
                        "model": "TournamentSeriesMetrics"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "metrics12M": {
                    "name": "metrics12M",
                    "isArray": false,
                    "type": {
                        "model": "TournamentSeriesMetrics"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "metrics6M": {
                    "name": "metrics6M",
                    "isArray": false,
                    "type": {
                        "model": "TournamentSeriesMetrics"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "metrics3M": {
                    "name": "metrics3M",
                    "isArray": false,
                    "type": {
                        "model": "TournamentSeriesMetrics"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "metrics1M": {
                    "name": "metrics1M",
                    "isArray": false,
                    "type": {
                        "model": "TournamentSeriesMetrics"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "events": {
                    "name": "events",
                    "isArray": true,
                    "type": {
                        "model": "Game"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "mainEvents": {
                    "name": "mainEvents",
                    "isArray": true,
                    "type": {
                        "model": "Game"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "topPlayers": {
                    "name": "topPlayers",
                    "isArray": true,
                    "type": {
                        "model": "PlayerSummary"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "trends": {
                    "name": "trends",
                    "isArray": false,
                    "type": {
                        "nonModel": "TrendAnalysis"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "recommendations": {
                    "name": "recommendations",
                    "isArray": true,
                    "type": "String",
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                }
            }
        },
        "SeriesVsRegularComparison": {
            "name": "SeriesVsRegularComparison",
            "fields": {
                "entityId": {
                    "name": "entityId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "timeRange": {
                    "name": "timeRange",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "seriesMetrics": {
                    "name": "seriesMetrics",
                    "isArray": false,
                    "type": {
                        "model": "EntityMetrics"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "seriesCount": {
                    "name": "seriesCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "seriesProfit": {
                    "name": "seriesProfit",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "seriesAvgEntries": {
                    "name": "seriesAvgEntries",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "regularMetrics": {
                    "name": "regularMetrics",
                    "isArray": false,
                    "type": {
                        "model": "EntityMetrics"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "regularCount": {
                    "name": "regularCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "regularProfit": {
                    "name": "regularProfit",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "regularAvgEntries": {
                    "name": "regularAvgEntries",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "profitDifference": {
                    "name": "profitDifference",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "profitDifferencePercent": {
                    "name": "profitDifferencePercent",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "avgEntriesDifference": {
                    "name": "avgEntriesDifference",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "avgEntriesDifferencePercent": {
                    "name": "avgEntriesDifferencePercent",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "insights": {
                    "name": "insights",
                    "isArray": true,
                    "type": "String",
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                }
            }
        },
        "TrendAnalysis": {
            "name": "TrendAnalysis",
            "fields": {
                "period": {
                    "name": "period",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "direction": {
                    "name": "direction",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "percentChange": {
                    "name": "percentChange",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "significance": {
                    "name": "significance",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "insights": {
                    "name": "insights",
                    "isArray": true,
                    "type": "String",
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                }
            }
        },
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
                "prizepoolPaid": {
                    "name": "prizepoolPaid",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "prizepoolCalculated": {
                    "name": "prizepoolCalculated",
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
                "totalUniquePlayers": {
                    "name": "totalUniquePlayers",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "totalInitialEntries": {
                    "name": "totalInitialEntries",
                    "isArray": false,
                    "type": "Int",
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
                "tournamentSeriesId": {
                    "name": "tournamentSeriesId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "seriesTitleId": {
                    "name": "seriesTitleId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "isMainEvent": {
                    "name": "isMainEvent",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "eventNumber": {
                    "name": "eventNumber",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "dayNumber": {
                    "name": "dayNumber",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "flightLetter": {
                    "name": "flightLetter",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "finalDay": {
                    "name": "finalDay",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "seriesYear": {
                    "name": "seriesYear",
                    "isArray": false,
                    "type": "Int",
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
                "skipped": {
                    "name": "skipped",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "skipReason": {
                    "name": "skipReason",
                    "isArray": false,
                    "type": "String",
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
                },
                "totalBuyInsCollected": {
                    "name": "totalBuyInsCollected",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "rakeRevenue": {
                    "name": "rakeRevenue",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "prizepoolPlayerContributions": {
                    "name": "prizepoolPlayerContributions",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "prizepoolAddedValue": {
                    "name": "prizepoolAddedValue",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "prizepoolSurplus": {
                    "name": "prizepoolSurplus",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "guaranteeOverlayCost": {
                    "name": "guaranteeOverlayCost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "gameProfit": {
                    "name": "gameProfit",
                    "isArray": false,
                    "type": "Float",
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
                "error": {
                    "name": "error",
                    "isArray": false,
                    "type": "String",
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
                "status": {
                    "name": "status",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "httpStatus": {
                    "name": "httpStatus",
                    "isArray": false,
                    "type": "Int",
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
        "ScraperJobsReport": {
            "name": "ScraperJobsReport",
            "fields": {
                "items": {
                    "name": "items",
                    "isArray": true,
                    "type": {
                        "model": "ScraperJob"
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
                },
                "entitySummary": {
                    "name": "entitySummary",
                    "isArray": true,
                    "type": {
                        "nonModel": "EntityJobSummary"
                    },
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                }
            }
        },
        "GapRange": {
            "name": "GapRange",
            "fields": {
                "start": {
                    "name": "start",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "end": {
                    "name": "end",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "count": {
                    "name": "count",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                }
            }
        },
        "GapSummary": {
            "name": "GapSummary",
            "fields": {
                "totalGaps": {
                    "name": "totalGaps",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "totalMissingIds": {
                    "name": "totalMissingIds",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "largestGapStart": {
                    "name": "largestGapStart",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "largestGapEnd": {
                    "name": "largestGapEnd",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "largestGapCount": {
                    "name": "largestGapCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "coveragePercentage": {
                    "name": "coveragePercentage",
                    "isArray": false,
                    "type": "Float",
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
        "GameProcessedEvent": {
            "name": "GameProcessedEvent",
            "fields": {
                "jobId": {
                    "name": "jobId",
                    "isArray": false,
                    "type": "ID",
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
                "tournamentId": {
                    "name": "tournamentId",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "url": {
                    "name": "url",
                    "isArray": false,
                    "type": "AWSURL",
                    "isRequired": false,
                    "attributes": []
                },
                "action": {
                    "name": "action",
                    "isArray": false,
                    "type": {
                        "enum": "GameProcessedAction"
                    },
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
                "errorMessage": {
                    "name": "errorMessage",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "processedAt": {
                    "name": "processedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": true,
                    "attributes": []
                },
                "durationMs": {
                    "name": "durationMs",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "dataSource": {
                    "name": "dataSource",
                    "isArray": false,
                    "type": "String",
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
                "gameData": {
                    "name": "gameData",
                    "isArray": false,
                    "type": {
                        "nonModel": "GameProcessedData"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "saveResult": {
                    "name": "saveResult",
                    "isArray": false,
                    "type": {
                        "nonModel": "GameSaveResult"
                    },
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "GameProcessedData": {
            "name": "GameProcessedData",
            "fields": {
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
                "guaranteeAmount": {
                    "name": "guaranteeAmount",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "prizepoolPaid": {
                    "name": "prizepoolPaid",
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
                "totalUniquePlayers": {
                    "name": "totalUniquePlayers",
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
                "gameType": {
                    "name": "gameType",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "gameVariant": {
                    "name": "gameVariant",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "tournamentType": {
                    "name": "tournamentType",
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
                "doNotScrape": {
                    "name": "doNotScrape",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "existingGameId": {
                    "name": "existingGameId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "GameSaveResult": {
            "name": "GameSaveResult",
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
                    "isRequired": false,
                    "attributes": []
                },
                "action": {
                    "name": "action",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "message": {
                    "name": "message",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "JobProgressEvent": {
            "name": "JobProgressEvent",
            "fields": {
                "jobId": {
                    "name": "jobId",
                    "isArray": false,
                    "type": "ID",
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
                "status": {
                    "name": "status",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "stopReason": {
                    "name": "stopReason",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "totalURLsProcessed": {
                    "name": "totalURLsProcessed",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
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
                "gamesSkipped": {
                    "name": "gamesSkipped",
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
                },
                "currentId": {
                    "name": "currentId",
                    "isArray": false,
                    "type": "Int",
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
                "startTime": {
                    "name": "startTime",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "durationSeconds": {
                    "name": "durationSeconds",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "successRate": {
                    "name": "successRate",
                    "isArray": false,
                    "type": "Float",
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
                "s3CacheHits": {
                    "name": "s3CacheHits",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "consecutiveNotFound": {
                    "name": "consecutiveNotFound",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "consecutiveErrors": {
                    "name": "consecutiveErrors",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "consecutiveBlanks": {
                    "name": "consecutiveBlanks",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "lastErrorMessage": {
                    "name": "lastErrorMessage",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "publishedAt": {
                    "name": "publishedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": true,
                    "attributes": []
                }
            }
        },
        "SocialFeedConnection": {
            "name": "SocialFeedConnection",
            "fields": {
                "items": {
                    "name": "items",
                    "isArray": true,
                    "type": {
                        "model": "SocialPost"
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
        "SocialPostConnection": {
            "name": "SocialPostConnection",
            "fields": {
                "items": {
                    "name": "items",
                    "isArray": true,
                    "type": {
                        "model": "SocialPost"
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
        "SocialAccountConnection": {
            "name": "SocialAccountConnection",
            "fields": {
                "items": {
                    "name": "items",
                    "isArray": true,
                    "type": {
                        "model": "SocialAccount"
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
        "SocialAccountMetrics": {
            "name": "SocialAccountMetrics",
            "fields": {
                "accountId": {
                    "name": "accountId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "totalPosts": {
                    "name": "totalPosts",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "totalEngagement": {
                    "name": "totalEngagement",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "avgLikesPerPost": {
                    "name": "avgLikesPerPost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "avgCommentsPerPost": {
                    "name": "avgCommentsPerPost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "avgSharesPerPost": {
                    "name": "avgSharesPerPost",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "postsThisPeriod": {
                    "name": "postsThisPeriod",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "engagementGrowth": {
                    "name": "engagementGrowth",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "topPerformingPosts": {
                    "name": "topPerformingPosts",
                    "isArray": true,
                    "type": {
                        "model": "SocialPost"
                    },
                    "isRequired": true,
                    "attributes": [],
                    "isArrayNullable": true
                }
            }
        },
        "SocialScrapeResult": {
            "name": "SocialScrapeResult",
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
                "postsFound": {
                    "name": "postsFound",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "newPostsAdded": {
                    "name": "newPostsAdded",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "postsProcessed": {
                    "name": "postsProcessed",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "rateLimited": {
                    "name": "rateLimited",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "timeout": {
                    "name": "timeout",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "oldestPostDate": {
                    "name": "oldestPostDate",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "SyncPageInfoResult": {
            "name": "SyncPageInfoResult",
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
                "logoUrl": {
                    "name": "logoUrl",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "SocialSyncEvent": {
            "name": "SocialSyncEvent",
            "fields": {
                "socialAccountId": {
                    "name": "socialAccountId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "status": {
                    "name": "status",
                    "isArray": false,
                    "type": {
                        "enum": "SyncEventStatus"
                    },
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
                "postsFound": {
                    "name": "postsFound",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "newPostsAdded": {
                    "name": "newPostsAdded",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "rateLimited": {
                    "name": "rateLimited",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "pagesCompleted": {
                    "name": "pagesCompleted",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "completedAt": {
                    "name": "completedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "SocialPostNonCashPrize": {
            "name": "SocialPostNonCashPrize",
            "fields": {
                "prizeType": {
                    "name": "prizeType",
                    "isArray": false,
                    "type": {
                        "enum": "NonCashPrizeType"
                    },
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
                "estimatedValue": {
                    "name": "estimatedValue",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "rawText": {
                    "name": "rawText",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "targetTournamentName": {
                    "name": "targetTournamentName",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "targetTournamentBuyIn": {
                    "name": "targetTournamentBuyIn",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "targetTournamentId": {
                    "name": "targetTournamentId",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "ticketType": {
                    "name": "ticketType",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "ticketQuantity": {
                    "name": "ticketQuantity",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "packageIncludes": {
                    "name": "packageIncludes",
                    "isArray": true,
                    "type": "String",
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "extractionConfidence": {
                    "name": "extractionConfidence",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "ProcessSocialPostResult": {
            "name": "ProcessSocialPostResult",
            "fields": {
                "success": {
                    "name": "success",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": true,
                    "attributes": []
                },
                "socialPostId": {
                    "name": "socialPostId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "processingStatus": {
                    "name": "processingStatus",
                    "isArray": false,
                    "type": {
                        "enum": "SocialPostProcessingStatus"
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
                },
                "warnings": {
                    "name": "warnings",
                    "isArray": true,
                    "type": "String",
                    "isRequired": true,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "extractedGameData": {
                    "name": "extractedGameData",
                    "isArray": false,
                    "type": {
                        "model": "SocialPostGameData"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "placementsExtracted": {
                    "name": "placementsExtracted",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "ticketSummary": {
                    "name": "ticketSummary",
                    "isArray": false,
                    "type": {
                        "nonModel": "TicketExtractionSummary"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "matchCandidates": {
                    "name": "matchCandidates",
                    "isArray": true,
                    "type": {
                        "nonModel": "GameMatchCandidate"
                    },
                    "isRequired": true,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "primaryMatch": {
                    "name": "primaryMatch",
                    "isArray": false,
                    "type": {
                        "nonModel": "GameMatchCandidate"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "linksCreated": {
                    "name": "linksCreated",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "linksSkipped": {
                    "name": "linksSkipped",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "linkDetails": {
                    "name": "linkDetails",
                    "isArray": true,
                    "type": {
                        "model": "SocialPostGameLink"
                    },
                    "isRequired": true,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "reconciliationPreview": {
                    "name": "reconciliationPreview",
                    "isArray": false,
                    "type": {
                        "nonModel": "SocialToGameReconciliation"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "processingTimeMs": {
                    "name": "processingTimeMs",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "GameMatchCandidate": {
            "name": "GameMatchCandidate",
            "fields": {
                "gameId": {
                    "name": "gameId",
                    "isArray": false,
                    "type": "ID",
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
                "gameDate": {
                    "name": "gameDate",
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
                "entityId": {
                    "name": "entityId",
                    "isArray": false,
                    "type": "ID",
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
                "matchConfidence": {
                    "name": "matchConfidence",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": true,
                    "attributes": []
                },
                "matchReason": {
                    "name": "matchReason",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "matchSignals": {
                    "name": "matchSignals",
                    "isArray": false,
                    "type": "AWSJSON",
                    "isRequired": false,
                    "attributes": []
                },
                "rank": {
                    "name": "rank",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "isPrimaryMatch": {
                    "name": "isPrimaryMatch",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "wouldAutoLink": {
                    "name": "wouldAutoLink",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "rejectionReason": {
                    "name": "rejectionReason",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "ProcessBatchResult": {
            "name": "ProcessBatchResult",
            "fields": {
                "success": {
                    "name": "success",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": true,
                    "attributes": []
                },
                "totalProcessed": {
                    "name": "totalProcessed",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "successCount": {
                    "name": "successCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "failedCount": {
                    "name": "failedCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "skippedCount": {
                    "name": "skippedCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "results": {
                    "name": "results",
                    "isArray": true,
                    "type": {
                        "nonModel": "ProcessSocialPostResult"
                    },
                    "isRequired": true,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "totalLinksCreated": {
                    "name": "totalLinksCreated",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "totalExtractionsDone": {
                    "name": "totalExtractionsDone",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "averageConfidence": {
                    "name": "averageConfidence",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalTicketsExtracted": {
                    "name": "totalTicketsExtracted",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "totalTicketValue": {
                    "name": "totalTicketValue",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "processingTimeMs": {
                    "name": "processingTimeMs",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "SocialPostMatchingStats": {
            "name": "SocialPostMatchingStats",
            "fields": {
                "totalPosts": {
                    "name": "totalPosts",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "processedPosts": {
                    "name": "processedPosts",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "linkedPosts": {
                    "name": "linkedPosts",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "pendingPosts": {
                    "name": "pendingPosts",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "failedPosts": {
                    "name": "failedPosts",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "resultPosts": {
                    "name": "resultPosts",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "promotionalPosts": {
                    "name": "promotionalPosts",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "generalPosts": {
                    "name": "generalPosts",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "autoLinkedCount": {
                    "name": "autoLinkedCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "manualLinkedCount": {
                    "name": "manualLinkedCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "verifiedCount": {
                    "name": "verifiedCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "rejectedCount": {
                    "name": "rejectedCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "averageConfidence": {
                    "name": "averageConfidence",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "topMatchReasons": {
                    "name": "topMatchReasons",
                    "isArray": false,
                    "type": "AWSJSON",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "UnlinkedPostsConnection": {
            "name": "UnlinkedPostsConnection",
            "fields": {
                "items": {
                    "name": "items",
                    "isArray": true,
                    "type": {
                        "nonModel": "SocialPostWithMatchInfo"
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
        "SocialPostWithMatchInfo": {
            "name": "SocialPostWithMatchInfo",
            "fields": {
                "socialPost": {
                    "name": "socialPost",
                    "isArray": false,
                    "type": {
                        "model": "SocialPost"
                    },
                    "isRequired": true,
                    "attributes": []
                },
                "extractedData": {
                    "name": "extractedData",
                    "isArray": false,
                    "type": {
                        "model": "SocialPostGameData"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "suggestedMatches": {
                    "name": "suggestedMatches",
                    "isArray": true,
                    "type": {
                        "nonModel": "GameMatchCandidate"
                    },
                    "isRequired": true,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "bestMatchConfidence": {
                    "name": "bestMatchConfidence",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "TicketExtractionSummary": {
            "name": "TicketExtractionSummary",
            "fields": {
                "totalPlacements": {
                    "name": "totalPlacements",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "placementsWithCash": {
                    "name": "placementsWithCash",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "placementsWithTickets": {
                    "name": "placementsWithTickets",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "placementsWithBoth": {
                    "name": "placementsWithBoth",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "placementsWithTicketOnly": {
                    "name": "placementsWithTicketOnly",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "totalCashPaid": {
                    "name": "totalCashPaid",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": true,
                    "attributes": []
                },
                "totalTicketValue": {
                    "name": "totalTicketValue",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": true,
                    "attributes": []
                },
                "totalCombinedValue": {
                    "name": "totalCombinedValue",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": true,
                    "attributes": []
                },
                "ticketsByType": {
                    "name": "ticketsByType",
                    "isArray": true,
                    "type": {
                        "nonModel": "TicketTypeCount"
                    },
                    "isRequired": true,
                    "attributes": [],
                    "isArrayNullable": false
                },
                "topPlacements": {
                    "name": "topPlacements",
                    "isArray": true,
                    "type": {
                        "nonModel": "PlacementPreview"
                    },
                    "isRequired": true,
                    "attributes": [],
                    "isArrayNullable": false
                }
            }
        },
        "TicketTypeCount": {
            "name": "TicketTypeCount",
            "fields": {
                "ticketType": {
                    "name": "ticketType",
                    "isArray": false,
                    "type": {
                        "enum": "NonCashPrizeType"
                    },
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
                "totalValue": {
                    "name": "totalValue",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "PlacementPreview": {
            "name": "PlacementPreview",
            "fields": {
                "place": {
                    "name": "place",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "playerName": {
                    "name": "playerName",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                },
                "cashPrize": {
                    "name": "cashPrize",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "ticketType": {
                    "name": "ticketType",
                    "isArray": false,
                    "type": {
                        "enum": "NonCashPrizeType"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "ticketValue": {
                    "name": "ticketValue",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "ticketDescription": {
                    "name": "ticketDescription",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "totalValue": {
                    "name": "totalValue",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "rawText": {
                    "name": "rawText",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "SocialToGameReconciliation": {
            "name": "SocialToGameReconciliation",
            "fields": {
                "socialPostId": {
                    "name": "socialPostId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "socialPostGameDataId": {
                    "name": "socialPostGameDataId",
                    "isArray": false,
                    "type": "ID",
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
                "gameDate": {
                    "name": "gameDate",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "social_totalCashPaid": {
                    "name": "social_totalCashPaid",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "social_totalTicketCount": {
                    "name": "social_totalTicketCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "social_totalTicketValue": {
                    "name": "social_totalTicketValue",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "social_accumulatorCount": {
                    "name": "social_accumulatorCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "social_accumulatorValue": {
                    "name": "social_accumulatorValue",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "social_totalPlacements": {
                    "name": "social_totalPlacements",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "social_prizepoolTotal": {
                    "name": "social_prizepoolTotal",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "game_prizepoolPaid": {
                    "name": "game_prizepoolPaid",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "game_numberOfAccumulatorTicketsPaid": {
                    "name": "game_numberOfAccumulatorTicketsPaid",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "game_accumulatorTicketValue": {
                    "name": "game_accumulatorTicketValue",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "game_totalEntries": {
                    "name": "game_totalEntries",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "game_hasAccumulatorTickets": {
                    "name": "game_hasAccumulatorTickets",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "cashDifference": {
                    "name": "cashDifference",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "ticketCountDifference": {
                    "name": "ticketCountDifference",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "ticketValueDifference": {
                    "name": "ticketValueDifference",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "hasDiscrepancy": {
                    "name": "hasDiscrepancy",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": true,
                    "attributes": []
                },
                "discrepancySeverity": {
                    "name": "discrepancySeverity",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "discrepancyNotes": {
                    "name": "discrepancyNotes",
                    "isArray": true,
                    "type": "String",
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "suggestedAction": {
                    "name": "suggestedAction",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "reconciledAt": {
                    "name": "reconciledAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "reconciledBy": {
                    "name": "reconciledBy",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "TicketReconciliationReport": {
            "name": "TicketReconciliationReport",
            "fields": {
                "totalGamesChecked": {
                    "name": "totalGamesChecked",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "gamesWithSocialData": {
                    "name": "gamesWithSocialData",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "gamesWithDiscrepancies": {
                    "name": "gamesWithDiscrepancies",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "gamesMatched": {
                    "name": "gamesMatched",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "totalCashDifference": {
                    "name": "totalCashDifference",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "totalTicketCountDifference": {
                    "name": "totalTicketCountDifference",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "totalTicketValueDifference": {
                    "name": "totalTicketValueDifference",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "reconciliations": {
                    "name": "reconciliations",
                    "isArray": true,
                    "type": {
                        "nonModel": "SocialToGameReconciliation"
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
        "ReconcileResult": {
            "name": "ReconcileResult",
            "fields": {
                "success": {
                    "name": "success",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": true,
                    "attributes": []
                },
                "socialPostGameDataId": {
                    "name": "socialPostGameDataId",
                    "isArray": false,
                    "type": "ID",
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
                "fieldsUpdated": {
                    "name": "fieldsUpdated",
                    "isArray": true,
                    "type": "String",
                    "isRequired": false,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "previousValues": {
                    "name": "previousValues",
                    "isArray": false,
                    "type": "AWSJSON",
                    "isRequired": false,
                    "attributes": []
                },
                "newValues": {
                    "name": "newValues",
                    "isArray": false,
                    "type": "AWSJSON",
                    "isRequired": false,
                    "attributes": []
                },
                "message": {
                    "name": "message",
                    "isArray": false,
                    "type": "String",
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
        "GameToSocialMatchResult": {
            "name": "GameToSocialMatchResult",
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
                "gameDate": {
                    "name": "gameDate",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "candidatesFound": {
                    "name": "candidatesFound",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "candidatesScored": {
                    "name": "candidatesScored",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "linksCreated": {
                    "name": "linksCreated",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "linksSkipped": {
                    "name": "linksSkipped",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "existingLinks": {
                    "name": "existingLinks",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "matchedPosts": {
                    "name": "matchedPosts",
                    "isArray": true,
                    "type": {
                        "nonModel": "SocialPostMatchCandidate"
                    },
                    "isRequired": true,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "linkDetails": {
                    "name": "linkDetails",
                    "isArray": true,
                    "type": {
                        "nonModel": "GameToSocialLinkDetail"
                    },
                    "isRequired": true,
                    "attributes": [],
                    "isArrayNullable": true
                },
                "matchContext": {
                    "name": "matchContext",
                    "isArray": false,
                    "type": {
                        "nonModel": "GameToSocialMatchContext"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "processingTimeMs": {
                    "name": "processingTimeMs",
                    "isArray": false,
                    "type": "Int",
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
        "SocialPostMatchCandidate": {
            "name": "SocialPostMatchCandidate",
            "fields": {
                "socialPostId": {
                    "name": "socialPostId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "postDate": {
                    "name": "postDate",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "contentType": {
                    "name": "contentType",
                    "isArray": false,
                    "type": {
                        "enum": "SocialPostContentType"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "extractedBuyIn": {
                    "name": "extractedBuyIn",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "extractedVenueName": {
                    "name": "extractedVenueName",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "matchConfidence": {
                    "name": "matchConfidence",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "matchReason": {
                    "name": "matchReason",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "matchSignals": {
                    "name": "matchSignals",
                    "isArray": false,
                    "type": "AWSJSON",
                    "isRequired": false,
                    "attributes": []
                },
                "rank": {
                    "name": "rank",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "isPrimaryGame": {
                    "name": "isPrimaryGame",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "mentionOrder": {
                    "name": "mentionOrder",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "wouldLink": {
                    "name": "wouldLink",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "GameToSocialLinkDetail": {
            "name": "GameToSocialLinkDetail",
            "fields": {
                "socialPostId": {
                    "name": "socialPostId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "linkId": {
                    "name": "linkId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": false,
                    "attributes": []
                },
                "status": {
                    "name": "status",
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
                },
                "matchConfidence": {
                    "name": "matchConfidence",
                    "isArray": false,
                    "type": "Int",
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
        "GameToSocialMatchContext": {
            "name": "GameToSocialMatchContext",
            "fields": {
                "matchMethod": {
                    "name": "matchMethod",
                    "isArray": false,
                    "type": "String",
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
                "searchRange": {
                    "name": "searchRange",
                    "isArray": false,
                    "type": {
                        "nonModel": "DateRange"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "candidatesScored": {
                    "name": "candidatesScored",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "candidatesAboveMinimum": {
                    "name": "candidatesAboveMinimum",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "DateRange": {
            "name": "DateRange",
            "fields": {
                "searchStart": {
                    "name": "searchStart",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "searchEnd": {
                    "name": "searchEnd",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "BatchGameToSocialMatchResult": {
            "name": "BatchGameToSocialMatchResult",
            "fields": {
                "totalRequested": {
                    "name": "totalRequested",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "processed": {
                    "name": "processed",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "totalLinksCreated": {
                    "name": "totalLinksCreated",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "totalLinksSkipped": {
                    "name": "totalLinksSkipped",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "results": {
                    "name": "results",
                    "isArray": true,
                    "type": {
                        "nonModel": "GameToSocialMatchResult"
                    },
                    "isRequired": true,
                    "attributes": [],
                    "isArrayNullable": true
                }
            }
        },
        "UserManagementResponse": {
            "name": "UserManagementResponse",
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
                "user": {
                    "name": "user",
                    "isArray": false,
                    "type": {
                        "model": "User"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "temporaryPassword": {
                    "name": "temporaryPassword",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "UsersConnection": {
            "name": "UsersConnection",
            "fields": {
                "items": {
                    "name": "items",
                    "isArray": true,
                    "type": {
                        "model": "User"
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
        "DetectedMultiDayPattern": {
            "name": "DetectedMultiDayPattern",
            "fields": {
                "isMultiDay": {
                    "name": "isMultiDay",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": true,
                    "attributes": []
                },
                "detectionSource": {
                    "name": "detectionSource",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "parsedDayNumber": {
                    "name": "parsedDayNumber",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "parsedFlightLetter": {
                    "name": "parsedFlightLetter",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "isFinalDay": {
                    "name": "isFinalDay",
                    "isArray": false,
                    "type": "Boolean",
                    "isRequired": false,
                    "attributes": []
                },
                "derivedParentName": {
                    "name": "derivedParentName",
                    "isArray": false,
                    "type": "String",
                    "isRequired": true,
                    "attributes": []
                }
            }
        },
        "ResetPasswordResponse": {
            "name": "ResetPasswordResponse",
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
                "temporaryPassword": {
                    "name": "temporaryPassword",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
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
        "EntityJobSummary": {
            "name": "EntityJobSummary",
            "fields": {
                "entityId": {
                    "name": "entityId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "entityName": {
                    "name": "entityName",
                    "isArray": false,
                    "type": "String",
                    "isRequired": false,
                    "attributes": []
                },
                "totalJobs": {
                    "name": "totalJobs",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "runningJobs": {
                    "name": "runningJobs",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "completedJobs": {
                    "name": "completedJobs",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "failedJobs": {
                    "name": "failedJobs",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "TournamentIdBounds": {
            "name": "TournamentIdBounds",
            "fields": {
                "entityId": {
                    "name": "entityId",
                    "isArray": false,
                    "type": "ID",
                    "isRequired": true,
                    "attributes": []
                },
                "lowestId": {
                    "name": "lowestId",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "highestId": {
                    "name": "highestId",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "totalCount": {
                    "name": "totalCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                },
                "lastUpdated": {
                    "name": "lastUpdated",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": true,
                    "attributes": []
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
                    "type": "Float",
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
        "GetReassignmentStatusResult": {
            "name": "GetReassignmentStatusResult",
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
                "task": {
                    "name": "task",
                    "isArray": false,
                    "type": {
                        "nonModel": "BackgroundTaskInfo"
                    },
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "BackgroundTaskInfo": {
            "name": "BackgroundTaskInfo",
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
                        "enum": "BackgroundTaskStatus"
                    },
                    "isRequired": true,
                    "attributes": []
                },
                "taskType": {
                    "name": "taskType",
                    "isArray": false,
                    "type": {
                        "enum": "BackgroundTaskType"
                    },
                    "isRequired": true,
                    "attributes": []
                },
                "targetCount": {
                    "name": "targetCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "processedCount": {
                    "name": "processedCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": false,
                    "attributes": []
                },
                "progressPercent": {
                    "name": "progressPercent",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                },
                "result": {
                    "name": "result",
                    "isArray": false,
                    "type": "AWSJSON",
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
                "createdAt": {
                    "name": "createdAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": true,
                    "attributes": []
                },
                "startedAt": {
                    "name": "startedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
                    "isRequired": false,
                    "attributes": []
                },
                "completedAt": {
                    "name": "completedAt",
                    "isArray": false,
                    "type": "AWSDateTime",
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
        "SaveSeriesAssignmentInfo": {
            "name": "SaveSeriesAssignmentInfo",
            "fields": {
                "tournamentSeriesId": {
                    "name": "tournamentSeriesId",
                    "isArray": false,
                    "type": "ID",
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
                "status": {
                    "name": "status",
                    "isArray": false,
                    "type": {
                        "enum": "SeriesAssignmentStatus"
                    },
                    "isRequired": false,
                    "attributes": []
                },
                "confidence": {
                    "name": "confidence",
                    "isArray": false,
                    "type": "Float",
                    "isRequired": false,
                    "attributes": []
                }
            }
        },
        "UnfinishedGamesConnection": {
            "name": "UnfinishedGamesConnection",
            "fields": {
                "items": {
                    "name": "items",
                    "isArray": true,
                    "type": {
                        "model": "Game"
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
                },
                "totalCount": {
                    "name": "totalCount",
                    "isArray": false,
                    "type": "Int",
                    "isRequired": true,
                    "attributes": []
                }
            }
        }
    },
    "codegenVersion": "3.4.4",
    "version": "3bca373c4f649599524dbc22d52b284f"
};