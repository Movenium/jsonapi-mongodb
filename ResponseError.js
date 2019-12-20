

class ResponseError extends Error {
    constructor(error, code = 400, message = null, extra = null) {
        super(error)

        const response = {error: error}
        if (message) response.message = message
        if (extra) response.extra = extra

        this.response = {
            statusCode: code, body: JSON.stringify(response)
        }
    }
}

module.exports = ResponseError