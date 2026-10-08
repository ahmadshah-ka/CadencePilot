import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  { ignores: [".next/**", "coverage/**", "node_modules/**", "next-env.d.ts"] },
  {
    rules: { "@typescript-eslint/no-explicit-any": "error" },
  },
  {
    // Layer boundaries: domain is pure; application never imports adapters or the web layer.
    files: ["src/domain/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "@/application/*",
            "@/infrastructure/*",
            "@/presentation/*",
            "next/*",
            "react",
          ],
        },
      ],
    },
  },
  {
    files: ["src/application/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: ["@/infrastructure/*", "@/presentation/*", "next/*", "react"] },
      ],
    },
  },
];

export default config;
