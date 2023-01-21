import dotenv from "dotenv";
import express, { Express } from "express";
import fs from "fs";
import * as http from "http";
import sqlite3 from "sqlite3";
import { WebSocket } from "ws";
import { Action, State, update } from "./state";

dotenv.config();

const app: Express = express();
const port = process.env.PORT;
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const db = new sqlite3.Database(":memory:", (err) => {
  if (err) {
    console.error(err);
  } else {
    console.log("Connected to in-memory database");
  }
});

const initSql = fs.readFileSync("./sql/init.sql").toString();

const dataArr = initSql.toString().replace(/[\n]/g, "").split(";");

db.serialize(() => {
  db.run("BEGIN TRANSACTION;");

  // console.log(dataArr);
  dataArr.forEach((query) => {
    if (query) {
      query += ";";
      db.run(query, (err) => {
        if (err) throw err;
      });
    }
  });

  db.run("COMMIT;", (err) => {
    if (err) throw err;
  });
});

let state: State = { tag: "Empty", db };

const dispatch = (action: Action): void => {
  const [nextState, effects] = update(action, state);
  state = nextState;
  effects.forEach((effect) => effect(state, dispatch));
};

wss.on("connection", (ws) => {
  dispatch({ tag: "PlayerJoined", player: ws });
});

// app.get('/test', (req: Request, res: Response) => {
//   res.send('working');
// });

server.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
