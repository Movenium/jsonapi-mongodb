
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
        
        let user

        if (body.grant_type === "refresh_token") {
            const claims = jwt.verify(body.refresh_token, this.params.public_key)

            if (claims.tokentype && claims.tokentype !== "refresh") throw new Error("Cannot refresh with token type: " + claims.tokentype)
        
            // TODO authorizer should be verified also .. not just username .. If username is changed or something
            const users = await this.api.query("users", {filter: {"attributes.username": claims.username}})

            if (users.length < 1) return {statusCode: 400, body: JSON.stringify({error: "refresh failed"})}
            user = users[0]
        }
        else {
            const users = await this.api.query("users", {filter: {"attributes.username": body.username}})

            if (users.length < 1) return {statusCode: 400, body: JSON.stringify({error: "login failed"})}
            user = users[0]
            const match = await bcrypt.compare(body.password, user.attributes.password);

            if (!match) return {statusCode: 400, body: JSON.stringify({error: "login failed"})}
        }

        const obj = {
            client_id: body.client_id
        }

        for (const key in this.params.values) {
            const value = tools.get(user, this.params.values[key])
            if (!value) throw new Error("Authorizer object creation failed because '" + this.params.values[key] + "' is not set in user data")
            obj[key] = value
        }

       
        return {statusCode: 200, body: JSON.stringify({
            access_token: jwt.sign(obj, this.privateKey, { algorithm: 'RS256', expiresIn: this.params.expires}),
            refresh_token: jwt.sign(Object.assign(obj, {type: "refresh"}), this.privateKey, { algorithm: 'RS256', expiresIn: this.params.refresh_expires || 3600 * 24 * 14}),
            expires_in: this.params.expires,
            token_type: "Bearer"
        })}
      

    }

    async hashPassword(plain_password) {
        const saltRounds = 10
        const salt = await bcrypt.genSalt(saltRounds)
        return await bcrypt.hash(plain_password, salt)
    }

}

module.exports = authentication