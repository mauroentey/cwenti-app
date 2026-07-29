import { productConfig } from "./config/product.config.js";

const updateUrl = process.env.LAUNCHER_UPDATE_URL?.trim();
const requestedBundlePlatform = process.env.CWENTI_BUNDLE_PLATFORM?.trim();
const bundlePlatform = ["darwin", "win32"].includes(requestedBundlePlatform)
  ? requestedBundlePlatform
  : process.platform === "win32" ? "win32" : "darwin";
const macSigningConfigured = Boolean(
  process.env.CSC_LINK?.trim() || process.env.CSC_NAME?.trim(),
);
const publish = updateUrl
  ? [{ provider: "generic", url: updateUrl }]
  : [{
      provider: "github",
      owner: "mauroentey",
      repo: "cwenti-app",
      releaseType: "release",
    }];

export default {
  appId: productConfig.appId,
  productName: productConfig.productName,
  copyright: `Copyright © 2026 ${productConfig.legalName}`,
  asar: true,
  asarUnpack: [
    "examples/**/*",
  ],
  compression: "maximum",
  directories: {
    output: "release",
    buildResources: "assets/icons",
  },
  files: [
    "src/**/*",
    "config/**/*",
    "registry/**/*",
    "examples/**/*",
    "assets/**/*",
    "LICENSE",
    "COMMERCIAL-LICENSE.md",
    "TRADEMARKS.md",
    "THIRD_PARTY_NOTICES.md",
    "package.json",
  ],
  extraResources: [
    {
      from: `bundled-apps/${bundlePlatform}`,
      to: "bundled-apps",
      filter: ["**/*"],
    },
  ],
  artifactName: "${productName}-${version}-${os}-${arch}.${ext}",
  protocols: [
    {
      name: productConfig.productName,
      schemes: [productConfig.deepLinkProtocol],
    },
  ],
  mac: {
    category: "public.app-category.productivity",
    icon: "assets/icons/icon.icns",
    identity: macSigningConfigured ? undefined : "-",
    hardenedRuntime: true,
    entitlements: "assets/entitlements.mac.plist",
    entitlementsInherit: "assets/entitlements.mac.plist",
    gatekeeperAssess: false,
    target: ["dmg", "zip"],
  },
  dmg: {
    sign: false,
  },
  win: {
    icon: "assets/icons/icon.ico",
    target: ["nsis"],
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    deleteAppDataOnUninstall: false,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
  },
  portable: {
    artifactName: "${productName}-${version}-portable-${arch}.${ext}",
  },
  publish,
};
