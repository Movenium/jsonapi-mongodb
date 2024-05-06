'use strict';
var mongo = require('mongodb');
var tools = require("./tools")
var jwt = require('jsonwebtoken')
var TokenExpiredError = require('jsonwebtoken/lib/TokenExpiredError')
var moment = require('moment')
var serverlessCom = require('./serverless')
var netlify = require('./netlify')
var ResponseError = require('./ResponseError')

// TODO: http://springbot.github.io/json-api/extensions/bulk/, serializer, deserializer, sideload, queryParameterMagic(multi)

// keep cached connection outside of api class so it can be used between lambda invocations 
// https://docs.atlas.mongodb.com/best-practices-connecting-to-aws-lambda/
let cachedMongoConnection = null

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

        if (cachedMongoConnection) this.connection = cachedMongoConnection
        else this.connection = cachedMongoConnection = await mongo.MongoClient.connect(this.url, { useNewUrlParser: true, useUnifiedTopology: true })

        this.db = this.connection.db(this.db_name)
        this.connected = true
    }

    authorize() {
        if (typeof this.params.token === "undefined" && this.params.fullaccess) return

        try {
            try {
                this.claims = jwt.verify(this.params.token, this.params.public_key)
            } catch(err) {
                if(!this.params?.public_key2) throw err;
                this.claims = jwt.verify(this.params.token, this.params.public_key2)
            }
        }
        catch (e) {
            throw new ResponseError(e.message, 401)
        }

        if (this.claims.tokentype && this.claims.tokentype === "refresh") throw new ResponseError("Cannot authorize with refresh token", 401)
    }

    getAuthorizer() {
        // if fullaccess is set it is possible to do capi calls without authorizer
        if (typeof this.params.token === "undefined" && this.params.fullaccess) return {}

        if (!this.claims) throw new Error("Cannot get authorizer because authorize() is not called")
        const obj = {}

        if (typeof this.params.authorizer === "string" || Array.isArray(this.params.authorizer)) {
            const add_filters = typeof this.params.authorizer === "string" ? [this.params.authorizer] : this.params.authorizer
            for (const key of add_filters) obj["meta.authorizer." + key] = this.claims[key]
        }
        else {
            for (let index in this.params.authorizer) obj[index] = this.params.authorizer[index]
        }

        return obj
    }

    async request(method, path, params) {        
        
        if (this.params.enforcer) await this.enforce(this.params.enforcer, method, path)

        const pathParams = tools.parsePath(path)
        method = method.toLowerCase()

        const collection = pathParams[0]

        if (method === "get" && pathParams.length > 1) {
            const response = await this.query(collection, {filter: {id: pathParams[1]}})
            return response[0]
        }
        else if (method === "get") return await this.query(collection, params.queryString || {})
        else if (method === "post") return await this.post(collection, params.body.data)
        else if (method === "patch") return await this.patch(collection, pathParams[1], params.body.data)
        else if (method === "delete") return await this.delete(collection, pathParams[1])
        else throw new Error("Unknown method: " + method)
        
    }

    async enforce(enforcer, method, path) {
       
        // this is called so this.claims would be solved .. little ugly
        if (!this.connected) await this.connect()

        const subject = tools.get(this.claims, enforcer.subject)

        if (!subject) throw new Error(`Cannot enforce request because ${enforcer.subject} is not set in claims`)

        if (!(await enforcer.casbin.enforce(subject, "/" + path, method))) {
            throw new ResponseError("not allowed", 403, `route ${method} ${path} is forbidden for ${subject}`)
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
        const project = parameters.fields ? this.createProject(collection, parameters.fields) : null

        this.queryParameterMagic(query)
        
        if (!this.connected) await this.connect()

        const fullQuery = Object.assign({"meta.status": {$ne : "removed"}}, query, this.getAuthorizer(), await this.queryFilters(collection))
        const response = await this.db.collection(collection).find(fullQuery).project(project).sort(sort).skip(skip).limit(limit).toArray()
       
        // count all the rows only if we needed .. and still use max 50ms for counting
        if (response.length >= limit || skip > 0) this.count = await this.db.collection(collection).count(fullQuery, {limit: 1000})
        else this.count = response.length
        
        response.forEach(async (doc) => {
            return await this.serialize(doc)
        })

        if (this.params.debug) this.writeDebug({query: {collection: collection, parameters: parameters, query: fullQuery, project: project, sort: sort, skip: skip, limit: limit, response: response}})
        return response
    }

    async queryFilters(collection) {
        return {}
    }

    createProject(type, project) {
        if (!project[type]) return null
        const fields = project[type].split(",")
        
        const obj = {type: 1}
        fields.forEach((item) => obj[item] = 1)
        return obj
    }
    
    async serialize(doc) {
        tools.convertMongoIdtoId(doc)
        return doc
    }

    async deserialize(doc, action) {
        if (doc.attributes) tools.searchDateAndConvert(doc.attributes)
        if (doc.relationships) tools.convertRelationsIdtoMongoId(doc.relationships)

        // if id is sent we remove it because id is actually _id in db
        if (doc.id) delete doc.id

        // always hash password field if it isnät hashed already
        if (this.params.authentication && doc.attributes && doc.attributes.password) {
            doc.attributes.password = await this.params.authentication.hashPassword(doc.attributes.password)
        }

        if (action === "post") {
            doc.meta = { authorizer: this.claims, created: new Date() }
        }

        if (action === "patch") {
            // use dot-format in attributes and relationships so only given values would be changed
            if (doc.attributes) tools.toDotFormat(doc, "attributes")
            if (doc.relationships) tools.toDotFormat(doc, "relationships")

            // set timestamp for this edit
            doc["meta.modified"] = new Date()
        }
    }
    
    async post(collection, doc) {
        if (!this.connected) await this.connect()
        
        await this.deserialize(doc, "post", collection)

        const response = await this.db.collection(collection).insertOne(doc)
     
        return await this.serialize(response.ops[0])
    }
    
    async patch (collection, id, doc) {
        
        await this.deserialize(doc, "patch", collection)

        if (!this.connected) await this.connect()

        const fullQuery = Object.assign(this.getAuthorizer(), {_id: new mongo.ObjectID(id)})
        if (this.params.createHistory) await this.saveToHistory(collection, fullQuery)
        const response = await this.db.collection(collection).findOneAndUpdate(fullQuery, { $set: doc }, {returnOriginal: false})

        return await this.serialize(response.value)
    }
    
    async delete(collection, id) {
        if (!this.connected) await this.connect()
        await this.db.collection(collection).updateOne(Object.assign(this.getAuthorizer(), {_id: new mongo.ObjectID(id)}), { $set: {"meta.status": "removed"} })
     
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

            if (value === "true") {
                params[key] = true
            }
            else if (value === "false") {
                params[key] = false
            }
            else if (key.startsWith("relationships.") && value.length === 24) {
                params[key] = new mongo.ObjectID(value)
            } 
            else if (value.includes(",")) {
                params[key] = {$in: value.split(",")}
            }       
            else if (key == "id") {
                delete params[key]
                params["_id"] = value.includes(",") ? {$in: value.split(",").map((id) => new mongo.ObjectID(id))} : new mongo.ObjectID(value)
            }  
            else if (key.startsWith("attributes.") && tools.testIsDateBetween(value)) {
                params[key] = {"$gte": moment.utc(value.split("_")[0]).toDate(), "$lte": new moment.utc(value.split("_")[1]).endOf("day").toDate()}
            }      
            else if (key.startsWith("attributes.") && tools.testIsDate(value)) {
                params[key] = {"$gte": moment.utc(value).toDate(), "$lte": new moment.utc(value).endOf("day").toDate()}
            }
        }
    }


    // wrap serverless.com supporter
    serverlessComEvent(event) {
        if (!this.serverlesscom) this.serverlesscom = new serverlessCom(this)
        return this.serverlesscom.serverlessComEvent(event)
    }

    // wrap netlify function supporter
    netlifyEvent(event) {
        if (!this.netlify) this.netlify = new netlify(this)
        return this.netlify.event(event)
    }

}

module.exports = api;