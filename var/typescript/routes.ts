function register(logger: any, config: any, api: any, request: any, response: { send: (data: { [key: string]: any; }) => void; }): void {
    response.send({
        success: true,
    });
}

export default function example(logger: any, config: any, api: { registerRoute: (route: string, controller: (request: any, response: any) => void) => void; }): void {
    api.registerRoute("register", (request: any, response: any) => register(logger, config, api, request, response));
}
