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
import { gzipSync, gunzipSync } from "zlib";
import { createCipheriv, createDecipheriv } from "crypto";
import State from "../state";
import System from "./index";
import { parseJson, formatJson } from "../json";

export default class Paths {
    static touch(filename: string) {
        const now = new Date();

        try {
            File.utimesSync(filename, now, now);
        } catch (err) {
            File.closeSync(File.openSync(filename, "w"));
        }
    }

    static loadJson<T>(file: string, replacement: T, key?: string, compressed?: boolean): T {
        if (!File.existsSync(file)) return replacement;

        try {
            const contents = compressed ? gunzipSync(File.readFileSync(file)) : File.readFileSync(file);

            if (key) {
                const cipher = createDecipheriv("aes-256-cbc", key, "XT2IN0SK62F1DK5G");
                const decrypted = cipher.update(contents.toString(), "hex", "utf8") + cipher.final("utf8");

                return parseJson<T>(decrypted, replacement);
            }

            return parseJson<T>(contents.toString(), replacement);
        } catch (_error) {
            return replacement;
        }
    }

    static saveJson<T>(file: string, value: T, pretty?: boolean, key?: string, compress?: boolean): void {
        if (key) {
            const cipher = createCipheriv("aes-256-cbc", key, "XT2IN0SK62F1DK5G");
            const contents = cipher.update(formatJson(value, pretty), "utf8", "hex") + cipher.final("hex");

            File.writeFileSync(file, compress ? gzipSync(contents) : contents);
        } else {
            const contents = formatJson(value, pretty);

            File.writeFileSync(file, compress ? gzipSync(contents) : contents);
        }
    }

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

    static get application(): string {
        return File.existsSync(join(__dirname, "../package.json")) ? join(__dirname, "../") : join(__dirname, "../../../");
    }

    static get yarn(): string {
        return join(Paths.application, "/node_modules/yarn/bin/yarn");
    }

    static data(bridge?: string): string {
        let path = "/var/lib/hoobs";

        if (System.platform === "docker") {
            path = "/hoobs";
        } else if (process.env.USER !== "root") {
            path = join(process.env.HOME || "", ".hoobs");
        }

        if (bridge && bridge !== "") path = join(path, bridge);

        File.ensureDirSync(path);

        return path;
    }

    static get log(): string {
        return join(Paths.data(), "hoobs.log");
    }

    static get bridges(): string {
        return join(Paths.data(), "bridges.conf");
    }

    static get config(): string {
        return join(Paths.data(), `${State.id}.conf`);
    }

    static get backups(): string {
        File.ensureDirSync(join(Paths.data(), "backups"));

        return join(Paths.data(), "backups");
    }
}
