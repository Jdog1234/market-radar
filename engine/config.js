// Runtime data settings shared by the engine modules (set by app-main from Settings).
//   polygonKey:   licensed market data + news (https://polygon.io). Empty = not configured.
//   licensedOnly: true = never use the free public sources (required for the paid product).
const config = { polygonKey: '', licensedOnly: false };

function setDataConfig(next) {
  Object.assign(config, next);
}

module.exports = { config, setDataConfig };
