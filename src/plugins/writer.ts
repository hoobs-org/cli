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
import State from "../state";
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
                    hoobs: true,
                    homebridge: true,
                    gui: false,
                    jest: false,
                });

                break;

            default:
                data = _.extend(data, (await Writer.features()));
                break;
        }

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

        Console.info(`\n${Chalk.white("Plugin")}${Chalk.dim(":")} ${Chalk.cyan(data.identifier)}`);
        Console.info(`${Chalk.white("Version")}${Chalk.dim(":")} ${Chalk.cyan(data.version)}`);
        Console.info(`${Chalk.white("Language")}${Chalk.dim(":")} ${Chalk.cyan(data.typescript ? "Typescript" : "JavaScript")}`);

        Console.info(`${Chalk.white("HOOBS Support")}${Chalk.dim(":")} ${Chalk.cyan(data.hoobs ? "True" : "False")}`);
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

        if (data.typescript) {
            Writer.tsconfig(data);
        }

        await Writer.dependencies(data, true);
        await Writer.dependencies(data);

        Console.info("Your plugin project has been created");
        Console.info(`Navigate to your plugin run ${Chalk.yellow(`cd ${data.name}`)}`);

        if (data.typescript) {
            Console.info(`To build your plugin run ${Chalk.yellow(`${State.manager === "yarn" ? "yarn build" : "npm run build"}`)}`);
            Console.info(`The output will be located in ${Chalk.cyan(join(data.name, "lib"))}`);
        }
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
                    name: "HOOBS Support",
                    value: "hoobs",
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
                    name: "Unit Testing",
                    value: "jest",
                },
            ],
            default: [
                "typescript",
                "hoobs",
                "homebridge",
            ],
        }]);

        return {
            typescript: results.options.indexOf("typescript") >= 0,
            hoobs: results.options.indexOf("hoobs") >= 0,
            homebridge: results.options.indexOf("homebridge") >= 0,
            gui: results.options.indexOf("gui") >= 0,
            jest: results.options.indexOf("jest") >= 0,
        };
    }

    static dependencies(data: { [key: string]: any }, dev?: boolean): Promise<void> {
        return new Promise((resolve) => {
            const flags = [];
            const packages = [];

            if (State.manager === "yarn") {
                flags.push("add");
            } else {
                flags.push("install");
            }

            if (dev) {
                flags.push(State.manager === "yarn" ? "--dev" : "---save-dev");

                if (data.typescript) {
                    packages.push("typescript");
                    packages.push("ts-node");
                    packages.push("@tsconfig/node10");
                    packages.push("rimraf");
                }

                if (data.jest) {
                    packages.push("jest");
                }

                packages.push("homebridge");
            } else {
                packages.push("axios");
            }

            if (packages.length > 0) {
                const proc = spawn(State.manager || "npm", [...flags, ...packages], {
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
        File.ensureDirSync(join(data.path, "src"));

        const keywords: string[] = [];

        if (data.hoobs) {
            keywords.push("hoobs-plugin");
        }

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
            license: "GPL-3.0",
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

    static tsconfig(data: { [key: string]: any }): void {
        File.writeFileSync(join(data.path, "tsconfig.json"), formatJson({
            extends: "@tsconfig/node10/tsconfig.json",
            compilerOptions: {
                target: "ES2018",
                module: "commonjs",
                lib: [
                    "es2015",
                    "es2016",
                    "es2017",
                    "es2018",
                ],
                declaration: true,
                declarationMap: true,
                sourceMap: true,
                outDir: "./lib",
                rootDir: "./src",
                strict: true,
                esModuleInterop: true,
                preserveConstEnums: true,
            },
            include: [
                "src/",
            ],
            exclude: [
                "**/*.test.js",
            ],
        }));
    }

    static npmignore(data: { [key: string]: any }): void {
        File.ensureDirSync(data.path);

        let contents = "";

        contents += "*.test.js\n";
        contents += "*.tgz\n";
        contents += ".vscode\n";
        contents += ".editorconfig\n";
        contents += ".eslintrc\n";
        contents += ".gitignore\n";
        contents += ".npmignore\n";
        contents += "tsconfig.json\n";
        contents += "node_modules/\n";
        contents += "src/\n";

        File.writeFileSync(join(data.path, ".npmignore"), contents);
    }

    static gitignore(data: { [key: string]: any }): void {
        File.ensureDirSync(data.path);

        let contents = "";

        contents += "# Logs\n";
        contents += "logs\n";
        contents += "*.log\n";
        contents += "npm-debug.log*\n";
        contents += "yarn-debug.log*\n";
        contents += "yarn-error.log*\n";
        contents += "lerna-debug.log*\n\n";
        contents += "# Diagnostic reports (https://nodejs.org/api/report.html)\n";
        contents += "report.[0-9]*.[0-9]*.[0-9]*.[0-9]*.json\n\n";
        contents += "# Runtime data\n";
        contents += "pids\n";
        contents += "*.pid\n";
        contents += "*.seed\n";
        contents += "*.pid.lock\n\n";
        contents += "# Directory for instrumented libs generated by jscoverage/JSCover\n";
        contents += "lib-cov\n\n";
        contents += "# Coverage directory used by tools like istanbul\n";
        contents += "coverage\n";
        contents += "*.lcov\n\n";
        contents += "# nyc test coverage\n";
        contents += ".nyc_output\n\n";
        contents += "# Grunt intermediate storage (https://gruntjs.com/creating-plugins#storing-task-files)\n";
        contents += ".grunt\n\n";
        contents += "# Bower dependency directory (https://bower.io/)\n";
        contents += "bower_components\n\n";
        contents += "# node-waf configuration\n";
        contents += ".lock-wscript\n\n";
        contents += "# Compiled binary addons (https://nodejs.org/api/addons.html)\n";
        contents += "lib/\n";
        contents += "build/Release\n\n";
        contents += "# Dependency directories\n";
        contents += "node_modules/\n";
        contents += "jspm_packages/\n\n";
        contents += "# TypeScript v1 declaration files\n";
        contents += "typings/\n\n";
        contents += "# TypeScript cache\n";
        contents += "*.tsbuildinfo\n\n";
        contents += "# Optional npm cache directory\n";
        contents += ".npm\n\n";
        contents += "# Optional eslint cache\n";
        contents += ".eslintcache\n\n";
        contents += "# Microbundle cache\n";
        contents += ".rpt2_cache/\n";
        contents += ".rts2_cache_cjs/\n";
        contents += ".rts2_cache_es/\n";
        contents += ".rts2_cache_umd/\n\n";
        contents += "# Optional REPL history\n";
        contents += ".node_repl_history\n\n";
        contents += "# Output of 'npm pack'\n";
        contents += "*.tgz\n\n";
        contents += "# Yarn Integrity file\n";
        contents += ".yarn-integrity\n\n";
        contents += "# dotenv environment variables file\n";
        contents += ".env\n";
        contents += ".env.test\n\n";
        contents += "# parcel-bundler cache (https://parceljs.org/)\n";
        contents += ".cache\n\n";
        contents += "# Next.js build output\n";
        contents += ".next\n\n";
        contents += "# Nuxt.js build / generate output\n";
        contents += ".nuxt\n";
        contents += "dist\n\n";
        contents += "# Gatsby files\n";
        contents += ".cache/\n";
        contents += "# Comment in the public line in if your project uses Gatsby and *not* Next.js\n";
        contents += "# https://nextjs.org/blog/next-9-1#public-directory-support\n";
        contents += "# public\n\n";
        contents += "# vuepress build output\n";
        contents += ".vuepress/dist\n\n";
        contents += "# Serverless directories\n";
        contents += ".serverless/\n\n";
        contents += "# FuseBox cache\n";
        contents += ".fusebox/\n\n";
        contents += "# DynamoDB Local files\n";
        contents += ".dynamodb/\n\n";
        contents += "# TernJS port file\n";
        contents += ".tern-port\n\n";
        contents += "# macOS junk\n";
        contents += ".DS_Store\n";

        File.writeFileSync(join(data.path, ".gitignore"), contents);
    }
}
