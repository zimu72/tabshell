#!/bin/bash
cat > '/usr/bin/${executable}' << 'END'
#!/bin/sh
exec '/opt/${productFilename}/${executable}' --no-sandbox --disable-dev-shm-usage --disable-gpu "$@"
END

chmod +x '/usr/bin/${executable}'
