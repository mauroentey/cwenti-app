/**
 * Única fuente de identidad y endpoints del producto.
 * Los secretos de firma y licencia se suministran durante la publicación.
 */
export const productConfig = Object.freeze({
  productName: "Cwenti",
  legalName: "Mauricio Samper",
  commercialEmail: "mauro@entey.net",
  website: "https://cwenti.com",
  repositoryUrl: "https://github.com/mauroentey/cwenti-app",
  registryUrl: "",
  appId: "com.cwenti.launcher",
  deepLinkProtocol: "cwenti",
  licensePublicKeyEd25519: "MCowBQYDK2VwAyEA76vva/SlTeWyre2WZuv3SL9kIc4eKyT4Q3zAS2bM6LE=",
  packagePublicKeyEd25519: "MCowBQYDK2VwAyEA5eBZxC3Aoco2NznigIJrmrB2SwZ91EO5kPPcMF+v5aw=",
  recommendedCodexVersion: "0.146.0-alpha.3.1",
  maximumDownloadBytes: 250 * 1024 * 1024,
  registryTimeoutMs: 15_000,
});

export default productConfig;
