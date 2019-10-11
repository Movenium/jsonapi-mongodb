# Install

`npm install @movenium/jsonapi-mongodb --save-dev`

or

`yarn add @movenium/jsonapi-mongodb`


# Using with serverless.com

Add two http events to your handler

```
events:
    - http: 
        path: /{collection}
        method: any
    - http: 
        path: /{collection}/{id}
        method: any
```

Here is full example what you need to add to your handler

```
module.exports.handler = async (event) => {
  const api = new (require('jsonapi-mongodb/api'))(mongodb_url, database_name, {
    public_key: <public key to check jwt token>,
    authorizer: "partnerid",
    createHistory: true
  })

  return await api.serverlessComEvent(event)
}
```

# Developing
https://github.com/dherault/serverless-offline

## tl;dr

`yarn add serverless-offline`

### add to end of the serverless.yml file

```
plugins:
  - serverless-offline
```
use by typing `serverless offline start`