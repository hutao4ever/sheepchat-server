mkdir .deploymentconfig
CWD=$(pwd)

if [ "$1" = "us" ]; then
   mkdir .deploymentconfig/us
   cp -r config .deploymentconfig/us/
   sed -i "s/\"localhost:8083\"/\"10.8.0.1:8083\"/" .deploymentconfig/us/config/sync.js
   sed -i "s/\"localhost\"/\"10.8.0.7\"/" .deploymentconfig/us/config/sync.js
   sshpass -v -f "/home/name/sshpass" rsync -av -e ssh -f '- .git/' -f '- .deploymentconfig/' -f '- config/' -f '- deploy.sh' -f '- uploads/*' -f '- profilepics/*' -f '- channel_icons/*' "$CWD" admin@172.233.145.58:~
   sshpass -v -f "/home/name/sshpass" rsync -av -e ssh "$CWD/.deploymentconfig/us/config" admin@172.233.145.58:~/sheepchat/
   echo "done"
elif [ "$1" = "cn" ]; then
   mkdir .deploymentconfig/cn
   cp -r config .deploymentconfig/cn/
   sed -i "s/\"localhost:8083\"/\"10.8.0.7:8083\"/" .deploymentconfig/cn/config/sync.js
   sed -i "s/\"localhost\"/\"10.8.0.1\"/" .deploymentconfig/cn/config/sync.js
   sshpass -v -f "/home/name/sshpass2" rsync -av -e ssh -f '- .git/' -f '- .deploymentconfig/' -f '- config/' -f '- deploy.sh' -f '- uploads/*' -f '- profilepics/*' -f '- channel_icons/*' "$CWD" admin@47.111.153.167:~
   sshpass -v -f "/home/name/sshpass2" rsync -av -e ssh "$CWD/.deploymentconfig/cn/config" admin@47.111.153.167:~/sheepchat/
   echo "done"
else
   echo "No server specified."
fi

rm -R .deploymentconfig