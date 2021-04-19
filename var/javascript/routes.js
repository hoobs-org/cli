function register(_logger, _config, _api, _request, response) {
    response.send({
        success: true,
    });
}

module.exports = (logger, config, api) => {
    api.registerRoute("register", (request, response) => register(logger, config, api, request, response));
};
