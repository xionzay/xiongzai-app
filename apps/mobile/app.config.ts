import type { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => {
  const configuredEnvironment = parseAppEnvironment(process.env.EXPO_PUBLIC_APP_ENV);
  const releaseBuild = process.env.NODE_ENV === "production" || process.env.EAS_BUILD_PROFILE === "production";
  const appEnvironment = releaseBuild && configuredEnvironment !== "test" ? "production" : configuredEnvironment;
  const mockPaymentRequested = process.env.EXPO_PUBLIC_ENABLE_MOCK_PAYMENT === "true";
  if (appEnvironment === "production" && mockPaymentRequested) throw new Error("生产构建禁止启用 Mock Payment Provider");
  const enableMockPayment = appEnvironment !== "production" && mockPaymentRequested;
  const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  const iosBundleIdentifier = process.env.IOS_BUNDLE_IDENTIFIER ?? (appEnvironment === "production" ? undefined : "com.xiongzai.esports.dev");
  const androidApplicationId = process.env.ANDROID_APPLICATION_ID ?? (appEnvironment === "production" ? undefined : "com.xiongzai.esports.dev");
  if (appEnvironment === "production" && (!apiBaseUrl || !apiBaseUrl.startsWith("https://"))) {
    throw new Error("生产构建必须配置 HTTPS 的 EXPO_PUBLIC_API_BASE_URL");
  }
  if (!iosBundleIdentifier || !androidApplicationId) throw new Error("生产构建必须显式配置 iOS Bundle ID 和 Android Application ID");

  return {
    ...config,
    name: "熊崽电竞",
    slug: "xiongzai-esports",
    scheme: "xiongzai",
    version: "0.1.0",
    platforms: ["ios", "android"],
    orientation: "portrait",
    userInterfaceStyle: "light",
    icon: "./assets/xiongzai-icon.png",
    splash: {
      image: "./assets/xiongzai-logo.png",
      resizeMode: "contain",
      backgroundColor: "#FFF9EF"
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: iosBundleIdentifier,
      infoPlist: {
        NSAppTransportSecurity: resolveIosTransportSecurity(appEnvironment),
        ...(appEnvironment !== "production" ? { NSLocalNetworkUsageDescription: "本地测试时连接开发电脑的 API 和受控媒体服务。" } : {})
      }
    },
    android: {
      package: androidApplicationId,
      softwareKeyboardLayoutMode: "resize",
      adaptiveIcon: {
        foregroundImage: "./assets/xiongzai-icon.png",
        backgroundColor: "#FFF9EF"
      }
    },
    plugins: [
      "expo-router",
      "expo-asset",
      "expo-system-ui",
      [
        "expo-splash-screen",
        {
          image: "./assets/xiongzai-logo.png",
          resizeMode: "contain",
          backgroundColor: "#FFF9EF"
        }
      ],
      ["expo-secure-store", { "configureAndroidBackup": true }],
      ["expo-video", { supportsBackgroundPlayback: false, supportsPictureInPicture: false }],
      [
        "expo-image-picker",
        {
          photosPermission: "用于选择头像、服务图片、凭证和聊天图片；图片只会在您确认后上传。",
          cameraPermission: "用于拍摄头像；图片只会在您确认后处理。",
          microphonePermission: "用于录制 10–30 秒声音名片或 1–60 秒聊天语音；录音仅在您确认后上传并进入审核，不用于实时通话。"
        }
      ],
      [
        "expo-audio",
        {
          microphonePermission: "用于录制 10–30 秒声音名片或 1–60 秒聊天语音；录音仅在您确认后上传并进入审核，不用于实时通话。",
          recordAudioAndroid: true,
          enableBackgroundRecording: false,
          enableBackgroundPlayback: false
        }
      ]
    ],
    experiments: {
      typedRoutes: true
    },
    extra: {
      appEnvironment,
      enableMockPayment
    }
  };
};

function resolveIosTransportSecurity(appEnvironment: "development" | "test" | "production") {
  const allowLocalDevelopmentHttp = appEnvironment !== "production";
  return {
    NSAllowsArbitraryLoads: allowLocalDevelopmentHttp,
    NSAllowsLocalNetworking: allowLocalDevelopmentHttp
  };
}

function parseAppEnvironment(value: string | undefined): "development" | "test" | "production" {
  if (value === undefined || value === "") return "development";
  if (value === "development" || value === "test" || value === "production") return value;
  throw new Error(`EXPO_PUBLIC_APP_ENV 配置无效：${value}`);
}
