"""Real installed OpenAI SDK, exact official URL, owned TLS fixture only."""
import json,ssl,socket,os,sys
import openai
with openai.OpenAI(api_key='qa473-only-sentinel',base_url='https://api.openai.com/v1',max_retries=0) as sdk:
 rows=list(sdk.responses.create(model='gpt-4.1',input='QA473_QUALIFY',stream=True,max_output_tokens=128))
assert len(rows)==1 and rows[0].type=='response.completed'
assert rows[0].response.output[0].content[0].text=='QA473 qualification accepted'
print(json.dumps({'verdict':'REAL_SDK_TLS_FIXTURE_ACCEPTED','sdk_version':openai.__version__,'address':socket.gethostbyname('api.openai.com'),'certificate':os.environ['SSL_CERT_FILE']}))
