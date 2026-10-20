# @fluentui/workspace-plugin

nx private monorepo plugin which contains:

- generators
- executors
- migrations
- other things...

## Usage

Run following to get all plugin functionality:

`yarn nx list @fluentui/workspace-plugin`

## Project discovery

The workspace plugin resolves project files, optional tool configurations, and
React Integration Tester (RIT) sibling/config paths against Nx's
`context.workspaceRoot`, independently of the process working directory.
Generated project keys and target paths remain workspace-relative (including
`{projectRoot}` and `{workspaceRoot}` tokens).
