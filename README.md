# Install

`npm install @movenium/jsonapi-mongodb --save-dev`

or

`yarn add @movenium/jsonapi-mongodb`

## Registry access

The package is published to GitHub Packages, not to npmjs.com. Installing it needs a GitHub token with the `read:packages` scope.

In the consuming repository, commit this line in `.npmrc` so `@movenium/*` packages resolve from GitHub Packages:

```
@movenium:registry=https://npm.pkg.github.com
```

Do not commit the token. On your machine, log in once with a classic personal access token that has `read:packages`:

```
npm login --scope=@movenium --auth-type=legacy --registry=https://npm.pkg.github.com
```

In GitHub Actions, pass `registry-url: 'https://npm.pkg.github.com'` and `scope: '@movenium'` to `actions/setup-node` and set `NODE_AUTH_TOKEN: ${{ github.token }}` on the install step. The consuming repository needs Read access under the package's "Manage Actions access" settings.

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


# Publishing a new version

Publishing runs in GitHub Actions (`.github/workflows/publish.yml`) when a GitHub release is published. Do not run `npm publish` from your machine.

1. Make sure you are on `master`, the working tree is clean, and the branch is up to date:
    ```
    git checkout master
    git pull --ff-only
    ```
2. Bump the version. `npm version` updates `package.json`, creates a commit and a matching `vX.Y.Z` tag:
    ```
    npm version patch    # bug/security fix
    npm version minor    # backwards-compatible feature
    npm version major    # breaking change
    ```
3. Push the commit and the tag:
    ```
    git push --follow-tags
    ```
4. Create a GitHub release from the tag. The workflow checks that the tag matches `package.json`, runs the tests and publishes the package.

For a pre-release, bump with `npm version prerelease --preid=alpha` and mark the GitHub release as a pre-release. It is published under the `alpha` dist-tag, so callers on `latest` do not pick it up. Install it with `npm install @movenium/jsonapi-mongodb@alpha`.

