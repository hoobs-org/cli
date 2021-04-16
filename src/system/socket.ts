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

import { IPCClient } from "@hoobs/ipc";
import { existsSync } from "fs-extra";
import { join } from "path";
import Paths from "./paths";

export default class Socket {
    declare private clients: { [key: string]: IPCClient };

    constructor() {
        this.clients = {};
    }

    static emit(event: string, data?: any): Promise<void> {
        return new Promise((resolve) => {
            const socket = Socket.connect("api");

            if (!socket) {
                resolve();
            } else {
                socket.emit(event, data).then(() => {
                    resolve();
                });
            }
        });
    }

    static fetch(path: string, params?: { [key: string]: any }, body?: { [key: string]: any }): Promise<any> {
        return new Promise((resolve) => {
            const socket = Socket.connect("api");

            if (!socket) {
                resolve(undefined);
            } else {
                socket.fetch(path, params, body).then((response) => {
                    resolve(response);
                });
            }
        });
    }

    static connect(id: string): IPCClient | undefined {
        if (!existsSync(join(Paths.data(), `${id}.sock`))) return undefined;

        return new IPCClient({ id, root: `${Paths.data()}/` });
    }
}
