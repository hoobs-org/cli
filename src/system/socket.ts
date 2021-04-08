/**************************************************************************************************
 * hoobs-cli                                                                                      *
 * Copyright (C) 2020 HOOBS                                                                       *
 *                                                                                                *
 * This program is free software: you can redistribute it and/or modify                           *
 * it under the terms of the GNU General Public License as published by                           *
 * the Free Software Foundation, either version 3 of the License, or                              *
 * (at your option) any later version.                                                            *
 *                                                                                                *
 * This program is distributed in the hope that it will be useful,                                *
 * but WITHOUT ANY WARRANTY; without even the implied warranty of                                 *
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the                                  *
 * GNU General Public License for more details.                                                   *
 *                                                                                                *
 * You should have received a copy of the GNU General Public License                              *
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.                          *
 **************************************************************************************************/

import RawIPC from "node-ipc";
import { existsSync } from "fs-extra";
import { join } from "path";
import Paths from "./paths";
import { Events } from "../logger";

const SOCKETS: { [key: string]: any } = {};
const SOCKET_CONNECTION_DELAY = 500;

export default class Socket {
    static emit(event: Events, body: any): Promise<void> {
        return new Promise((resolve) => {
            const session = `${new Date().getTime()}:${Math.random()}`;

            if (!existsSync(join(Paths.data(), "api.sock"))) {
                resolve();

                return;
            }

            if (!SOCKETS["api.sock"]) {
                SOCKETS["api.sock"] = new RawIPC.IPC();

                SOCKETS["api.sock"].config.appspace = "/";
                SOCKETS["api.sock"].config.socketRoot = Paths.data();
                SOCKETS["api.sock"].config.logInColor = true;
                SOCKETS["api.sock"].config.logger = () => { };
                SOCKETS["api.sock"].config.maxRetries = 0;
                SOCKETS["api.sock"].config.stopRetrying = true;
            }

            SOCKETS["api.sock"].connectTo("api.sock", () => {
                SOCKETS["api.sock"].of["api.sock"].emit(event, {
                    session,
                    body,
                });

                setTimeout(() => {
                    resolve();
                }, SOCKET_CONNECTION_DELAY);
            });
        });
    }

    static fetch(path: string, params?: { [key: string]: any }, body?: { [key: string]: any }): Promise<any> {
        return new Promise((resolve) => {
            const session = `${new Date().getTime()}:${Math.random()}`;

            if (!existsSync(join(Paths.data(), "api.sock"))) {
                resolve(null);

                return;
            }

            if (!SOCKETS["api.sock"]) {
                SOCKETS["api.sock"] = new RawIPC.IPC();

                SOCKETS["api.sock"].config.appspace = "/";
                SOCKETS["api.sock"].config.socketRoot = Paths.data();
                SOCKETS["api.sock"].config.logInColor = true;
                SOCKETS["api.sock"].config.logger = () => { };
                SOCKETS["api.sock"].config.maxRetries = 0;
                SOCKETS["api.sock"].config.stopRetrying = true;
                SOCKETS["api.sock"].config.id = "api.sock";
            }

            SOCKETS["api.sock"].connectTo("api.sock", () => {
                SOCKETS["api.sock"].of["api.sock"].on(session, (data: any) => {
                    SOCKETS["api.sock"].of["api.sock"].off(session, "*");
                    SOCKETS["api.sock"].disconnect();

                    resolve(data);
                });

                SOCKETS["api.sock"].of["api.sock"].on("error", () => {
                    SOCKETS["api.sock"].of["api.sock"].off(session, "*");
                    SOCKETS["api.sock"].disconnect();

                    resolve(null);
                });

                SOCKETS["api.sock"].of["api.sock"].emit(Events.REQUEST, {
                    path,
                    session,
                    params,
                    body,
                });
            });
        });
    }
}
