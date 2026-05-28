import urllib.request, urllib.error, json

try:
    req = urllib.request.Request(
        'http://localhost:8080/api/v1/copilot/chat', 
        data=json.dumps({'message': 'Hola'}).encode('utf-8'), 
        headers={'Content-Type': 'application/json'}
    )
    res = urllib.request.urlopen(req)
    print(res.read().decode())
except urllib.error.HTTPError as e:
    print('ERROR:', e.code, e.read().decode())
except Exception as e:
    print('OTHER ERROR:', e)
