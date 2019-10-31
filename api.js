'use strict';
var mongo = require('mongodb');
var tools = require("./tools")
var jwt = require('jsonwebtoken')
var moment = require('moment')



// TODO: http://springbot.github.io/json-api/extensions/bulk/, serializer, deserializer, sideload, queryParameterMagic(multi)

class api {

    constructor(url, db_name, params) {
        this.connection = this.db = null
        this.connected = null

        this.url = url
        this.db_name = db_name
        this.params = params
    }

    async connect() {

        this.authorize()

        this.connection = await mongo.MongoClient.connect(this.url)
        this.db = this.connection.db(this.db_name)

        this.connected = true
    }

    async close() {
        this.connection.close()
        
        this.connected = false
    }

    authorize() {
        if (typeof this.params.token === "undefined" && this.params.fullaccess) return
        this.claims = jwt.verify(this.params.token, this.params.public_key)

        if (this.claims.tokentype && this.claims.tokentype === "refresh") throw new Error("Cannot authorize with refresh token")
    }

    getAuthorizer() {
        // if fullaccess is set it is possible to do capi calls without authorizer
        if (typeof this.params.token !== "undefined" && this.params.fullaccess) return {}

        if (!this.claims) throw new Error("Cannot get authorizer because authorize() is not called")
        const obj = {}
        const add_filters = typeof this.params.authorizer === "string" ? [this.params.authorizer] : this.params.authorizer
        for (const key of add_filters) obj["meta.authorizer." + key] = this.claims[key]

        return obj
    }

    getMetaForDocument() {
        return {
            authorizer: this.claims,
            created: new Date()
        }
    }

    createRequestFromServerlessComEvent(event) {
        return {
            token: event.headers.Authorization ? event.headers.Authorization.substring(7) : null,
            method: event.httpMethod,
            path: event.pathParameters.collection + (event.pathParameters.id ? "/" + event.pathParameters.id : ""),
            params: {
                queryString: tools.parseServerlessComQueryParams(event.queryStringParameters), 
                body: tools.tryToParseJson(event.body)
            }
        }
    }

    async serverlessComEvent(event) {
        const request = this.createRequestFromServerlessComEvent(event)
        
        this.params.token = request.token

        let response

        // always response 200 for options calls
        if (request.method.toLowerCase() === "options") return { statusCode: 200 }
        
        // login requests are handled in authentication class
        if (this.params.authentication && request.method.toLowerCase() === "post" && event.pathParameters.collection === "login") {
            return this.params.authentication.login(event.body)
        }

        try {
            response = await this.request(request.method, request.path, request.params)
        }
        catch (reason) {
            //throw reason
            return {
                statusCode: 400,
                body: JSON.stringify({error: reason.message})
            }    
        }

        const body = request.method.toLowerCase() === "delete" ? null : {data: response}
        
        const meta = {}
        if (this.count) meta.count = this.count
        if (this.debug) meta.debug = this.debug
        if (body && Object.keys(meta).length > 0) body.meta = meta

        return {
            statusCode: request.method.toLowerCase() === "delete" ? 204 : 200,
            body: JSON.stringify(body)
        }
    }

    async request(method, path, params) {
        const pathParams = tools.parsePath(path)
        method = method.toLowerCase()

        const collection = pathParams[0]

        if (method === "get" && pathParams.length > 1) {
            const response = await this.query(collection, {filter: {id: pathParams[1]}})
            return response[0]
        }
        else if (method === "get") {
            return await this.query(collection, params.queryString || {})
        }
        else if (method === "post") {
            return await this.post(collection, params.body.data)
        }
        else if (method === "patch") {
            return await this.patch(collection, pathParams[1], params.body.data)
        }
        else if (method === "delete") {
            return await this.delete(collection, pathParams[1])
        }
        else {
            throw new Error("Unknown method: " + method)
        }
    }

    writeDebug(data) {
        if (!this.debug) this.debug = []
        this.debug.push(JSON.parse(JSON.stringify(data)))
    }

    createSort(str) {
        const sort = {}
        const direction = str.startsWith("-") ? -1 : 1
        const key = direction === 1 ? str : str.substring(1)
        sort[key] = direction
        return sort
    }

    async query(collection, parameters = {}) {
        const skip = parameters.offset ? parseInt(parameters.offset) : 0
        const limit = parameters.limit ? parseInt(parameters.limit) : 25
        const query = parameters.filter ? parameters.filter : {}
        const sort = parameters.sort ? this.createSort(parameters.sort) : null

        this.queryParameterMagic(query)
        
        const autoclose = this.connected ? false : true
        if (!this.connected) await this.connect()

        const fullQuery = Object.assign({"meta.status": {$ne : "removed"}}, query, this.getAuthorizer())
        const response = await this.db.collection(collection).find(fullQuery).sort(sort).skip(skip).limit(limit).toArray()
       
        // count all the rows only if we needed .. and still use max 50ms for counting
        if (response.length >= limit || skip > 0) this.count = await this.db.collection(collection).count(fullQuery, {maxTimeMS: 50})

        if (autoclose) this.close()
        
        response.forEach((doc) => this.serialize(doc))

        if (this.params.debug) this.writeDebug({query: {collection: collection, parameters: parameters, query: fullQuery, sort: sort, skip: skip, limit: limit, response: response}})
        return response
    }
    
    serialize(doc) {
        tools.convertMongoIdtoId(doc)
    }
    
    async post(collection, doc) {
        if (doc.attributes) tools.searchDateAndConvert(doc.attributes)

        if (doc.attributes && doc.attributes.password) {
            doc.attributes.password = await this.params.authentication.hashPassword(doc.attributes.password)
        }
        
        const autoclose = this.connected ? false : true
        if (!this.connected) await this.connect()
        doc.meta = this.getMetaForDocument()

        if (doc.relationships) tools.convertRelationsIdtoMongoId(doc.relationships)

        const response = await this.db.collection(collection).insertOne(doc)
        if (autoclose) this.close()

        return tools.convertMongoIdtoId(response.ops[0])
    }
    
    async patch (collection, id, set) {
        tools.searchDateAndConvert(set.attributes)

        // if id is sent we remove it because id is actually _id in db
        if (set.id) delete set.id

        // use dot-format in attributes and relationships so only given values would be changed
        if (set.attributes) tools.toDotFormat(set, "attributes")
        if (set.relationships) tools.convertRelationsIdtoMongoId(set.relationships)
        if (set.relationships) tools.toDotFormat(set, "relationships")

        // set timestamp for this edit
        set["meta.modified"] = new Date()

        const autoclose = this.connected ? false : true
        if (!this.connected) await this.connect()

        const fullQuery = Object.assign(this.getAuthorizer(), {_id: new mongo.ObjectID(id)})
        if (this.params.createHistory) await this.saveToHistory(collection, fullQuery)
        const response = await this.db.collection(collection).findOneAndUpdate(fullQuery, { $set: set }, {returnOriginal: false})

        if (autoclose) this.close()

        return tools.convertMongoIdtoId(response.value)
    }
    
    async delete(collection, id) {
        const autoclose = this.connected ? false : true
        if (!this.connected) await this.connect()
        await this.db.collection(collection).updateOne(Object.assign(this.getAuthorizer(), {_id: new mongo.ObjectID(id)}), { $set: {"meta.status": "removed"} })
        if (autoclose) this.close()

        return null
    }

    async saveToHistory(originalCollection, fullQuery) {
        const originalDocument = await this.db.collection(originalCollection).findOne(fullQuery)
        const relations = {}

        const historyCollection = "_history"

        relations["doc"] = {data: {type: originalCollection, id: originalDocument._id}, type: historyCollection}
        await this.post(historyCollection, {attributes: {original: originalDocument}, relationships: relations})
    }

    queryParameterMagic(params) {
        for (const key in params) {
            const value = params[key]

            if (typeof value !== "string") continue

            if (key.startsWith("relationships.") && value.length === 24) {
                params[key] = new mongo.ObjectID(value)
            }        
            else if (key == "id") {
                delete params[key]
                params["_id"] = value.includes(",") ? {$in: value.split(",").map((id) => new mongo.ObjectID(id))} : new mongo.ObjectID(value)
            }        
            else if (key.startsWith("attributes.") && tools.testIsDate(value)) {
                params[key] = {"$gte": moment.utc(value).toDate(), "$lte": new moment.utc(value).endOf("day").toDate()}
            }
            else if (key.startsWith("attributes.") && tools.testIsDateBetween(value)) {
                params[key] = {"$gte": moment.utc(value.split("_")[0]).toDate(), "$lte": new moment.utc(value.split("_")[1]).endOf("day").toDate()}
            }
        }
    }

}

module.exports = api;