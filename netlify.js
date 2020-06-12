'use strict';
var tools = require("./tools")
var ResponseError = require("./ResponseError")

class netlify {

    constructor(api) {
        this.api = api
    }

    createRequestFromNetlifyEvent(event) {
        return {
            token: event.headers.authorization ? event.headers.authorization.substring(7) : null,
            method: event.httpMethod,
            path: event.path.split("/").slice(4).join("/"),
            params: {
                queryString: tools.parseServerlessComQueryParams(event.queryStringParameters), 
                body: tools.tryToParseJson(event.body)
            }
        }
    }

    async event(event) {
        const request = this.createRequestFromServerlessComEvent(event)
        
        this.api.params.token = request.token

        let response

        const headers = {}
        if (this.api.params.cors) {
            headers["Access-Control-Allow-Credentials"] = true
            headers["Access-Control-Allow-Origin"] =  "*"
        }

        // always response 200 for options calls
        if (request.method.toLowerCase() === "options") return { statusCode: 200, headers: {
            'Access-Control-Allow-Origin': "*",
            'Access-Control-Allow-Methods': "GET, POST, PATCH, DELETE",
            'Access-Control-Allow-Headers': "*"
        } }
        
        // login requests are handled in authentication class
        if (this.api.params.authentication && request.method.toLowerCase() === "post" && event.pathParameters.collection === "login") {
            const response = await this.api.params.authentication.login(event.body)
            response.headers = headers
            return response
        }

        try {
            response = await this.api.request(request.method, request.path, request.params)
        }
        catch (e) {
            if (e instanceof ResponseError) return e.response
            throw e
        }

        const body = request.method.toLowerCase() === "delete" ? null : {data: response}
        
        const meta = {}
        if (typeof this.api.count !== "undefined") meta.count = this.api.count
        if (this.api.debug) meta.debug = this.api.debug
        if (body && Object.keys(meta).length > 0) body.meta = meta

        return {
            statusCode: request.method.toLowerCase() === "delete" ? 204 : 200,
            headers: headers,
            body: JSON.stringify(body)
        }
    }
}

module.exports = netlify;