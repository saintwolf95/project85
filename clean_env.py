with open('.env', 'r', encoding='utf-8') as f:
    text = f.read()
import re
text = re.sub(r'[^\x00-\x7F]+', '', text)
with open('.env', 'w', encoding='utf-8') as f:
    f.write(text)
