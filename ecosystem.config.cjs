module.exports = {
  apps: [
    {
      name: "roborally",
      script: "server/index.js",
      cwd: "/home/ubuntu/roborally",
      env: {
        NODE_ENV: "production",
        PORT: "6282",
        BASE_PATH: "/roborally"
      }
    }
  ]
};
