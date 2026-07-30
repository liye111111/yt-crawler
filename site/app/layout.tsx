import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const title = "Vehicle Lens 车鉴｜VIN 解码与车型查询工具";
const description = "免费 VIN 解码与车型查询工具，结合 NHTSA vPIC、五级车型数据库和 AI 辅助分析，查询年款、品牌、车系、配置款、发动机与车辆规格。";
const productionUrl = "https://vin.carmodelx.com";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = host.startsWith("localhost") ? `${protocol}://${host}` : productionUrl;
  const image = `${origin}/og.png`;
  return {
    metadataBase: new URL(origin),
    title,
    description,
    applicationName: "Vehicle Lens",
    category: "automotive",
    keywords: ["VIN decoder", "VIN 查询", "VIN 解码", "车型查询", "vehicle lookup", "car model lookup", "NHTSA vPIC", "年款", "品牌", "车系", "配置款", "发动机"],
    authors: [{ name: "Vehicle Lens", url: productionUrl }],
    creator: "Vehicle Lens",
    publisher: "Vehicle Lens",
    alternates: { canonical: "/" },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
    },
    openGraph: {
      type: "website",
      url: "/",
      siteName: "Vehicle Lens",
      locale: "zh_CN",
      title,
      description,
      images: [{ url: image, width: 1732, height: 909, alt: "Vehicle Lens VIN 解码与车型查询工具" }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${productionUrl}/#website`,
      url: productionUrl,
      name: "Vehicle Lens 车鉴",
      alternateName: "Vehicle Lens",
      description,
      inLanguage: ["zh-CN", "en", "ja"],
    },
    {
      "@type": "WebApplication",
      "@id": `${productionUrl}/#application`,
      name: "Vehicle Lens",
      url: productionUrl,
      description,
      applicationCategory: "UtilitiesApplication",
      operatingSystem: "Any",
      browserRequirements: "Requires a modern web browser with JavaScript enabled",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      featureList: [
        "17-character VIN decoding with NHTSA vPIC",
        "Vehicle lookup by year, make, model, trim, and engine",
        "AI-assisted interpretation for missing VIN attributes",
        "Vehicle specifications and Wikimedia Commons reference images",
        "Chinese, English, and Japanese interface",
      ],
      provider: { "@type": "Organization", name: "Vehicle Lens", url: productionUrl },
      inLanguage: ["zh-CN", "en", "ja"],
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
        {children}
      </body>
    </html>
  );
}
