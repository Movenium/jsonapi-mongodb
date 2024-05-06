
var jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const tools = require('./tools');

class authentication {

    constructor(api, privateKey, params) {
        this.api = api
        this.privateKey = privateKey
        this.params = params
    }

    async login(queryParams) {
        const body = tools.parseQuery(queryParams)
        
        let user, scopes

        if (body.grant_type === "refresh_token") {
            let claims = null;
            try {
                claims = jwt.verify(body.refresh_token, this.params.public_key)
            } catch(err) {
                if(!this.params?.public_key2) throw err;
                claims = jwt.verify(body.refresh_token, this.params.public_key2)
            }

            if (claims.tokentype && claims.tokentype !== "refresh") throw new Error("Cannot refresh with token type: " + claims.tokentype)
        
            scopes = claims.scope

            // TODO authorizer should be verified also .. not just username .. If username is changed or something
            const users = await this.api.query("users", {filter: {"attributes.username": claims.username}})

            if (users.length < 1) return {statusCode: 400, body: JSON.stringify({error: "refresh failed"})}
            user = users[0]
        }
        else {
            scopes = body.scope

            const users = await this.api.query("users", {filter: {"attributes.username": body.username}})

            if (users.length < 1) return {statusCode: 400, body: JSON.stringify({error: "login failed"})}
            user = users[0]
            const match = await bcrypt.compare(body.password, user.attributes.password);

            if (!match) return {statusCode: 400, body: JSON.stringify({error: "login failed"})}
        }

        const tokenObj = {
            client_id: body.client_id
        }

        for (const key in this.params.values) {
            const value = tools.get(user, this.params.values[key])
            if (!value) throw new Error("Authorizer object creation failed because '" + this.params.values[key] + "' is not set in user data")
            tokenObj[key] = value
        }

        await this.api.patch("users", user.id, {"attributes.lastlogin": new Date()})

        if (scopes) {
            const userScopes = await this.api.query("userscopes", {filter: {
                "attributes.scope": {'$in': scopes.split(" ")},
                "relationships.user.data.id": user.id
            }})
            tokenObj.scope = userScopes.map((item) => item.attributes.scope).join(" ")
        }

        const response = {
            access_token: jwt.sign(tokenObj, this.privateKey, { algorithm: 'RS256', expiresIn: this.params.expires}),
            refresh_token: jwt.sign(Object.assign(tokenObj, {type: "refresh"}), this.privateKey, { algorithm: 'RS256', expiresIn: this.params.refresh_expires || 3600 * 24 * 14}),
            expires_in: this.params.expires,
            token_type: "Bearer"
        }

        if (scopes) response.scope = tokenObj.scope

        if (this.params.includeUserDocument) response.user = user
       
        return {statusCode: 200, body: JSON.stringify(response)}
    }

    async hashPassword(plain_password) {

        // do not double hash
        if (plain_password.substring(0,7) === "$2b$10$") return plain_password

        const saltRounds = 10
        const salt = await bcrypt.genSalt(saltRounds)
        return await bcrypt.hash(plain_password, salt)
    }

}

module.exports = authentication