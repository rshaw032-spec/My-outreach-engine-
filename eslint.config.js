export default [
  {
    plugins: {
      firebaseRulesPlugin: require('@firebase/eslint-plugin-security-rules')
    },
    rules: {
      "firebaseRulesPlugin/no-unnecessary-condition": "error"
    }
  }
];
