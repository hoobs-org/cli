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

import File from "fs-extra";
import { join } from "path";
import State from "../state";

export default class Paths {
    static tryCommand(command: string): boolean {
        const paths = (process.env.PATH || "").split(":");

        for (let i = 0; i < paths.length; i += 1) {
            if (File.existsSync(join(paths[i], command))) return true;
        }

        return false;
    }

    static tryUnlink(filename: string): boolean {
        if (File.existsSync(filename)) {
            try {
                File.unlinkSync(filename);
            } catch (_fail) {
                try {
                    File.removeSync(filename);
                } catch (_error) {
                    return false;
                }
            }
        }

        return true;
    }

    static isEmpty(path: string): boolean {
        if (File.existsSync(path)) {
            try {
                return (!(File.readdirSync(path)).length);
            } catch (_error) {
                return false;
            }
        }

        return false;
    }

    static storagePath(instance?: string): string {
        let path = "/var/lib/hoobs";

        if (State.container) {
            path = "/hoobs";
        } else if (process.env.USER !== "root") {
            path = join(process.env.HOME || "", ".hoobs");
        }

        if (instance && instance !== "") path = join(path, instance);

        File.ensureDirSync(path);

        return path;
    }

    static logPath(): string {
        return join(Paths.storagePath(), "hoobs.log");
    }

    static instancesPath(): string {
        return join(Paths.storagePath(), "instances.conf");
    }

    static configPath(): string {
        return join(Paths.storagePath(), `${State.id}.conf`);
    }

    static backupPath(): string {
        File.ensureDirSync(join(Paths.storagePath(), "backups"));

        return join(Paths.storagePath(), "backups");
    }
}
