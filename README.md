# Install

`npm install @movenium/jsonapi-mongodb --save-dev`

or

`yarn add @movenium/jsonapi-mongodb`

## Requirements

- Node.js 24 LTS (AWS Lambda nodejs24.x runtime)
- npm 10+ or Yarn 1.x

Use nvm to match the runtime locally:

```
nvm install 24
nvm use 24
```


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
const apiClass = require('@movenium/jsonapi-mongodb/api')

module.exports.handler = async (event) => {
  const api = new apiClass(mongodb_url, database_name, {
    public_key: <public key to check jwt token>,
    authorizer: "partnerid",
    createHistory: true
  })

  return await api.serverlessComEvent(event)
}
```

# Standalone usage

Create api

```
const apiClass = require('@movenium/jsonapi-mongodb/api')

const api = new apiClass(mongodb_url, database_name, {
  fullaccess: true,
  authorizer: "partnerid",
})
```

Set partnerid to be used

```
api.claims = {partnerid: 12345}
```

Write row

```
const doc = await api.post("logs", {
    attributes: {timestamp: new Date(), message: "hello world"}, 
    type: "logs"
})
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


# Publishing a new package to npmjs
Prerequisite: You have to have an account on npmjs.com. If you do not have, create new account and let someone connect you to our organization in npmjs.
1. make sure you are in correct branch you would like to publish
2. run `npm login` from the command line
3. run `npm publish` and the package will be automatically published in npmjs.com

# Publishing a new package on github
1. click on "New release" on the right side of the repository page in github
2. from the "choose tag" -dropdown you can create new release

