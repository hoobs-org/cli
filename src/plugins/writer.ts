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

import _ from "lodash";
import Semver from "semver";
import { spawn } from "child_process";
import { join } from "path";
import File from "fs-extra";
import Inquirer from "inquirer";
import Chalk from "chalk";
import { Console } from "../logger";
import { formatJson, sanitize } from "../formatters";

const prompt: Inquirer.PromptModule = Inquirer.createPromptModule();

export default class Writer {
    static async create(scope: string, name: string, tag: string): Promise<void> {
        let data: { [key: string]: any } = {};

        data.name = sanitize(name);
        data.version = Semver.valid(tag) || "0.0.1";

        if (!data.version || data.version === "") {
            data.version = "0.0.1";
        }

        data.display = (await prompt([
            {
                type: "input",
                name: "display",
                message: "enter a display name for your plugin",
                validate: (value: string | undefined) => {
                    if (!value || value === "") return "a name is required";

                    return true;
                },
            },
        ])).display;

        const { preset } = (await prompt([{
            type: "list",
            name: "preset",
            message: "Please pick a preset",
            choices: [
                {
                    name: "default (Typescript, HOOBS & Homebridge)",
                    value: "default",
                },
                {
                    name: "Manually select features",
                    value: "manual",
                },
            ],
            default: "default",
        }]));

        switch (preset) {
            case "default":
                data = _.extend(data, {
                    typescript: true,
                    eslint: true,
                    homebridge: true,
                    gui: false,
                    nodemon: false,
                    jest: false,
                });

                break;

            default:
                data = _.extend(data, (await Writer.features()));
                break;
        }

        data = _.extend(data, (await Writer.license()));

        if (data.homebridge && !data.name.startsWith("homebridge-")) {
            data.name = `homebridge-${data.name}`;
        }

        data.path = join(process.cwd(), data.name);
        data.identifier = data.name;

        if (scope && scope !== "") {
            data.identifier = `@${sanitize(scope)}/${name}`;
        }

        if (File.existsSync(data.path)) {
            const { proceed } = (await prompt([{
                type: "confirm",
                name: "proceed",
                message: `${data.name} already exists, do you want to overwrite`,
                default: false,
            }]));

            if (!proceed) {
                return;
            }
        }

        Console.info(`\n${Chalk.white("Name")}${Chalk.dim(":")} ${Chalk.cyan(data.display)}`);
        Console.info(`${Chalk.white("Plugin")}${Chalk.dim(":")} ${Chalk.cyan(data.identifier)}`);
        Console.info(`${Chalk.white("Version")}${Chalk.dim(":")} ${Chalk.cyan(data.version)}`);
        Console.info(`${Chalk.white("Language")}${Chalk.dim(":")} ${Chalk.cyan(data.typescript ? "Typescript" : "JavaScript")}`);
        Console.info(`${Chalk.white("License")}${Chalk.dim(":")} ${Chalk.cyan(data.license)}`);

        Console.info(`${Chalk.white("Homebridge Support")}${Chalk.dim(":")} ${Chalk.cyan(data.homebridge ? "True" : "False")}`);
        Console.info(`${Chalk.white("GUI Support")}${Chalk.dim(":")} ${Chalk.cyan(data.gui ? "True" : "False")}`);
        Console.info(`${Chalk.white("Unit Testing")}${Chalk.dim(":")} ${Chalk.cyan(data.jest ? "True" : "False")}\n`);

        const { proceed } = (await prompt([{
            type: "confirm",
            name: "proceed",
            message: "Does everything look OK",
            default: true,
        }]));

        if (!proceed) {
            return;
        }

        Writer.package(data);
        Writer.npmignore(data);
        Writer.gitignore(data);

        if (data.nodemon) {
            Writer.nodemon(data);
        }

        if (data.typescript) {
            Writer.tsconfig(data);
        }

        await Writer.dependencies(data, true);
        await Writer.dependencies(data);

        if (data.eslint) {
            Writer.eslintrc(data);
        }

        if (data.typescript) {
            Writer.typescript(data);
        } else {
            Writer.javascript(data);
        }

        Writer.schema(data);

        if (data.gui) {
            Writer.gui(data);
        }

        Console.info("Your plugin project has been created");
        Console.info(`Navigate to your plugin run ${Chalk.yellow(`cd ${data.name}`)}`);

        if (data.typescript) {
            const manager = File.existsSync("/usr/local/bin/yarn") || File.existsSync("/usr/bin/yarn") ? "yarn" : "npm";

            Console.info(`To build your plugin run ${Chalk.yellow(`${manager === "yarn" ? "yarn build" : "npm run build"}`)}`);
            Console.info(`The output will be located in ${Chalk.cyan(join(data.name, "lib"))}`);
        }
    }

    static gui(data: { [key: string]: any }): void {
        File.ensureDirSync(data.path);
        File.ensureDirSync(join(data.path, "static"));

        File.writeFileSync(join(data.path, "static", "index.html"), File.readFileSync(join(__dirname, "../../var/index.html")).toString());

        if (data.typescript) {
            File.ensureDirSync(join(data.path, "src"));
            File.writeFileSync(join(data.path, "src", "routes.ts"), File.readFileSync(join(__dirname, "../../var/typescript/routes.ts")).toString());
        } else {
            File.ensureDirSync(join(data.path, "lib"));
            File.writeFileSync(join(data.path, "lib", "routes.js"), File.readFileSync(join(__dirname, "../../var/javascript/routes.js")).toString());
        }
    }

    static typescript(data: { [key: string]: any }): void {
        File.ensureDirSync(data.path);
        File.ensureDirSync(join(data.path, "src"));

        File.writeFileSync(join(data.path, "src", "index.ts"), File.readFileSync(join(__dirname, "../../var/typescript/index.ts")).toString());
        File.writeFileSync(join(data.path, "src", "platform.ts"), File.readFileSync(join(__dirname, "../../var/typescript/platform.ts")).toString());
        File.writeFileSync(join(data.path, "src", "accessory.ts"), File.readFileSync(join(__dirname, "../../var/typescript/accessory.ts")).toString());

        let settings = "";

        settings += `export const PLATFORM_NAME = "${data.display}";\n`;
        settings += `export const PLUGIN_NAME = "${data.name}";\n`;

        File.writeFileSync(join(data.path, "src", "settings.ts"), settings);
    }

    static javascript(data: { [key: string]: any }): void {
        File.ensureDirSync(data.path);
        File.ensureDirSync(join(data.path, "lib"));

        File.writeFileSync(join(data.path, "lib", "index.js"), File.readFileSync(join(__dirname, "../../var/javascript/index.js")).toString());
        File.writeFileSync(join(data.path, "lib", "platform.js"), File.readFileSync(join(__dirname, "../../var/javascript/platform.js")).toString());
        File.writeFileSync(join(data.path, "lib", "accessory.js"), File.readFileSync(join(__dirname, "../../var/javascript/accessory.js")).toString());

        let settings = "";

        settings += "module.exports = {\n";
        settings += `    PLATFORM_NAME: "${data.display}",\n`;
        settings += `    PLUGIN_NAME: "${data.name}",\n`;
        settings += "};\n";

        File.writeFileSync(join(data.path, "lib", "settings.js"), settings);
    }

    static schema(data: { [key: string]: any }): void {
        File.writeFileSync(join(data.path, "config.schema.json"), formatJson({
            pluginAlias: data.display,
            pluginType: "platform",
            singular: true,
            schema: {
                type: "object",
                properties: {
                    name: {
                        title: "Name",
                        type: "string",
                        required: true,
                        default: "",
                    },
                },
            },
        }));
    }

    static async features(): Promise<{ [key: string]: any }> {
        const results = await prompt([{
            type: "checkbox",
            name: "options",
            message: "Check the features needed for your plugin: (Press <space> to select)",
            choices: [
                {
                    name: "Typescript",
                    value: "typescript",
                },
                {
                    name: "Homebridge Support",
                    value: "homebridge",
                },
                {
                    name: "GUI Support",
                    value: "gui",
                },
                {
                    name: "Nodemon (required Homebridge support)",
                    value: "nodemon",
                },
                {
                    name: "Linting (+ AirBnB)",
                    value: "eslint",
                },
                {
                    name: "Unit Testing",
                    value: "jest",
                },
            ],
            default: [
                "typescript",
                "homebridge",
                "eslint",
                "jest",
            ],
        }]);

        return {
            typescript: results.options.indexOf("typescript") >= 0,
            homebridge: results.options.indexOf("homebridge") >= 0,
            gui: results.options.indexOf("gui") >= 0,
            eslint: results.options.indexOf("eslint") >= 0,
            jest: results.options.indexOf("jest") >= 0,
        };
    }

    static async license(): Promise<{ [key: string]: any }> {
        const results = await prompt([{
            type: "list",
            name: "license",
            message: "Please select a license",
            choices: [
                {
                    name: "Academic Free License v3.0",
                    value: "AFL-3.0",
                },
                {
                    name: "Apache License 2.0",
                    value: "Apache-2.0",
                },
                {
                    name: "Artistic License 2.0",
                    value: "Artistic-2.0",
                },
                {
                    name: "Boost Software License 1.0",
                    value: "BSL-1.0",
                },
                {
                    name: "BSD 2 Clause \"Simplified\" License",
                    value: "BSD-2-Clause",
                },
                {
                    name: "BSD 3 Clause \"New\" or \"Revised\" License",
                    value: "BSD-3-Clause",
                },
                {
                    name: "BSD 3 Clause Clear License",
                    value: "BSD-3-Clause-Clear",
                },
                {
                    name: "Creative Commons Zero v1.0 Universal",
                    value: "CC0-1.0",
                },
                {
                    name: "Creative Commons Attribution 4.0",
                    value: "CC-BY-4.0",
                },
                {
                    name: "Creative Commons Attribution Share Alike 4.0",
                    value: "CC-BY-SA-4.0",
                },
                {
                    name: "Do What The F*ck You Want To Public License",
                    value: "WTFPL",
                },
                {
                    name: "Educational Community License v2.0",
                    value: "ECL-2.0",
                },
                {
                    name: "Eclipse Public License 1.0",
                    value: "EPL-1.0",
                },
                {
                    name: "Eclipse Public License 2.0",
                    value: "EPL-2.0",
                },
                {
                    name: "European Union Public License 1.1",
                    value: "EUPL-1.1",
                },
                {
                    name: "GNU Affero General Public License v3.0",
                    value: "AGPL-3.0",
                },
                {
                    name: "GNU General Public License v2.0",
                    value: "GPL-2.0",
                },
                {
                    name: "GNU General Public License v3.0",
                    value: "GPL-3.0",
                },
                {
                    name: "GNU Lesser General Public License v2.1",
                    value: "LGPL-2.1",
                },
                {
                    name: "GNU Lesser General Public License v3.0",
                    value: "LGPL-3.0",
                },
                {
                    name: "ISC",
                    value: "ISC",
                },
                {
                    name: "LaTeX Project Public License v1.3c",
                    value: "LPPL-1.3c",
                },
                {
                    name: "Microsoft Public License",
                    value: "MS-PL",
                },
                {
                    name: "MIT",
                    value: "MIT",
                },
                {
                    name: "Mozilla Public License 2.0",
                    value: "MPL-2.0",
                },
                {
                    name: "Open Software License 3.0",
                    value: "OSL-3.0",
                },
                {
                    name: "PostgreSQL License",
                    value: "PostgreSQL",
                },
                {
                    name: "SIL Open Font License 1.1",
                    value: "OFL-1.1",
                },
                {
                    name: "NCSA Open Source License",
                    value: "NCSA",
                },
                {
                    name: "The Unlicense",
                    value: "Unlicense",
                },
                {
                    name: "zLib License",
                    value: "Zlib",
                },
            ],
            default: "Apache-2.0",
        }]);

        return {
            license: results.license,
        };
    }

    static dependencies(data: { [key: string]: any }, dev?: boolean): Promise<void> {
        return new Promise((resolve) => {
            const flags = [];
            const packages = [];
            const manager = File.existsSync("/usr/local/bin/yarn") || File.existsSync("/usr/bin/yarn") ? "yarn" : "npm";

            if (manager === "yarn") {
                flags.push("add");
            } else {
                flags.push("install");
            }

            if (dev) {
                flags.push(manager === "yarn" ? "--dev" : "---save-dev");

                if (data.typescript) {
                    packages.push("typescript");
                    packages.push("ts-node");
                    packages.push("@tsconfig/node10");
                    packages.push("rimraf");
                }

                if (data.jest) {
                    packages.push("jest");
                }

                if (data.eslint) {
                    packages.push("eslint");
                }

                if (data.eslint && data.typescript) {
                    packages.push("@typescript-eslint/eslint-plugin");
                    packages.push("@typescript-eslint/parser");
                    packages.push("eslint-config-airbnb-typescript");
                    packages.push("eslint-plugin-import");
                    packages.push("eslint-plugin-jsx-a11y");
                    packages.push("eslint-plugin-react");
                    packages.push("eslint-plugin-react-hooks");
                    packages.push("homebridge");
                } else if (data.eslint) {
                    packages.push("eslint-config-airbnb-base");
                    packages.push("eslint-plugin-import");
                }

                if (data.nodemon) {
                    packages.push("nodemon");
                }
            } else {
                packages.push("axios");
            }

            if (packages.length > 0) {
                const proc = spawn(manager || "npm", [...flags, ...packages], {
                    cwd: data.path,
                    stdio: ["inherit", "inherit", "inherit"],
                });

                proc.on("close", async () => {
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }

    static package(data: { [key: string]: any }): void {
        File.ensureDirSync(data.path);

        const keywords: string[] = [];

        keywords.push("hoobs-plugin");

        if (data.homebridge) {
            keywords.push("homebridge-plugin");
        }

        const scripts: { [key: string]: any } = {};

        if (data.typescript) {
            scripts.build = "rimraf ./lib && tsc";
        }

        if (data.jest) {
            scripts.test = "jest";
        }

        File.writeFileSync(join(data.path, "package.json"), formatJson({
            name: data.identifier,
            version: data.version,
            license: data.license,
            keywords,
            main: data.typescript ? "lib/index.js" : "index.js",
            engines: {
                node: ">=10.17.0",
            },
            scripts,
            dependencies: {},
            devDependencies: {},
        }));
    }

    static nodemon(data: { [key: string]: any }): void {
        File.ensureDirSync(data.path);

        const content: { [key: string]: any } = {
            ignore: [],
            signal: "SIGTERM",
            env: {
                NODE_OPTIONS: "--trace-warnings",
            },
        };

        if (data.typescript) {
            content.watch = ["src"];
            content.ext = "ts";
            content.exec = `tsc && homebridge -I -D -P ${data.path}`;
        } else {
            content.watch = ["."];
            content.exec = `homebridge -I -D -P ${data.path}`;
        }

        File.writeFileSync(join(data.path, "nodemon.json"), formatJson(content));
    }

    static eslintrc(data: { [key: string]: any }): void {
        File.ensureDirSync(data.path);

        if (data.typescript) {
            File.writeFileSync(join(data.path, ".eslintrc"), File.readFileSync(join(__dirname, "../../var/typescript/eslintrc")).toString());
        } else {
            File.writeFileSync(join(data.path, ".eslintrc"), File.readFileSync(join(__dirname, "../../var/javascript/eslintrc")).toString());
        }
    }

    static tsconfig(data: { [key: string]: any }): void {
        File.ensureDirSync(data.path);
        File.writeFileSync(join(data.path, "tsconfig.json"), File.readFileSync(join(__dirname, "../../var/typescript/tsconfig")).toString());
    }

    static npmignore(data: { [key: string]: any }): void {
        File.ensureDirSync(data.path);
        File.writeFileSync(join(data.path, ".npmignore"), File.readFileSync(join(__dirname, "../../var/npmignore")).toString());
    }

    static gitignore(data: { [key: string]: any }): void {
        File.ensureDirSync(data.path);
        File.writeFileSync(join(data.path, ".gitignore"), File.readFileSync(join(__dirname, "../../var/gitignore")).toString());
    }
}
