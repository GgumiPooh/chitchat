import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import perfectionist from "eslint-plugin-perfectionist";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import { defineConfig, globalIgnores } from "eslint/config";

const buildPropOrderingOptions = (multilineSelector) => {
  const customGroups = [
    { groupName: "key", elementNamePattern: "^key$" },
    { groupName: "ref", elementNamePattern: "^ref$" },
    { groupName: "className", elementNamePattern: "^className$" },
    { groupName: "innerClassName", elementNamePattern: ".ClassName$" },
    { groupName: "id", elementNamePattern: "^id$" },
    { groupName: "domAttrs", elementNamePattern: "^(data|aria)-" },
    {
      groupName: "multilineProps",
      modifiers: ["multiline"],
      selector: multilineSelector,
    },
    { groupName: "handlers", elementNamePattern: "^on[A-Z]" },
  ];
  const groups = [
    "key",
    "ref",
    "className",
    "innerClassName",
    "unknown",
    "id",
    "domAttrs",
    "multilineProps",
    "handlers",
  ];

  return {
    type: "unsorted",
    customGroups,
    groups,
  };
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  eslintPluginPrettierRecommended,
  {
    plugins: { perfectionist },
    rules: {
      "perfectionist/sort-jsx-props": ["error", buildPropOrderingOptions("prop")],
      "perfectionist/sort-object-types": ["error", buildPropOrderingOptions("property")],
      "perfectionist/sort-objects": [
        "error",
        {
          ...buildPropOrderingOptions("property"),
          useConfigurationIf: { objectType: "destructured" },
        },
        { type: "unsorted" },
      ],
      curly: ["error", "all"],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports",
          fixStyle: "inline-type-imports",
          disallowTypeAnnotations: true,
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "ExportNamedDeclaration[source=null][declaration=null]",
          message:
            "Place 'export' inline on the declaration (export function/const/...) instead of a trailing 'export { ... }'. Re-exports with 'from' are allowed.",
        },
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/app/*/**",
                "@/pages/*/**",
                "@/widgets/*/**",
                "@/features/*/**",
                "@/entities/*/**",
                "@/shared/*/**",
              ],
              message:
                "Bypasses the public API. Import from '@/<layer>/<slice|segment>' (its index.ts). For same-segment files, use a relative path like './file' to avoid a circular import through index.ts.",
            },
            {
              group: ["../../**"],
              message:
                "Cross-slice/layer relative import bypasses the public API. Use '@/<layer>/<slice|segment>' instead.",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([
    // INFO: Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
