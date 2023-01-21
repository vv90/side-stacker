# Code showcase: Node - Express - React - TypeScript

This is a Side-stacker game (horizontal version of connect-four game).

It contains 3 separate projects:

## shared
Contains code shared between frontend and backend

Build:
`npx tsc -b`
It should be built first in order for the other two projects to have access to it.

## server
Node/Express backend with a placeholder SQLite database

Build:
`npm run build`
Run:
`npm start`

## client
create-react-app single page React application

Build:
`npm run build`
Run:
`npm start`
