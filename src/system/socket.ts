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

const sockets: { [key: string]: any } = [];

export default class Socket {
    static fetch(event: Events, body: any): Promise<any> {
        return new Promise((resolve) => {
            const session = `${new Date().getTime()}:${Math.random()}`;

            if (!existsSync(join(Paths.storagePath(), "api.sock"))) {
                resolve();

                return;
            }

            if (!sockets["api.sock"]) {
                sockets["api.sock"] = new RawIPC.IPC();

                sockets["api.sock"].config.appspace = "/";
                sockets["api.sock"].config.socketRoot = Paths.storagePath();
                sockets["api.sock"].config.logInColor = true;
                sockets["api.sock"].config.logger = () => { };
                sockets["api.sock"].config.maxRetries = 0;
                sockets["api.sock"].config.stopRetrying = true;
            }

            sockets["api.sock"].connectTo("api.sock", () => {
                sockets["api.sock"].of["api.sock"].on(session, () => {
                    sockets["api.sock"].of["api.sock"].off(session, "*");
                    sockets["api.sock"].disconnect();

                    resolve();
                });

                sockets["api.sock"].of["api.sock"].on("error", () => {
                    sockets["api.sock"].of["api.sock"].off(session, "*");
                    sockets["api.sock"].disconnect();

                    resolve();
                });

                sockets["api.sock"].of["api.sock"].emit(event, {
                    session,
                    body,
                });
            });
        });
    }
}
