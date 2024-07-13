# arg1としてURLを受け取る
URL=$1

# URLが空の場合はエラーを出力して終了
if [ -z $URL ]; then
  echo "Usage: htmd.sh URL"
  echo "URL is required."
  exit 1
fi

# URLを引数にしてcurlとhtmdを実行
curl -s -L -o - $URL | htmd - --options-file htmd-options.toml
