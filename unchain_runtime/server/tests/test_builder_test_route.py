from test_skeleton_production_chat import production  # noqa: F401
from test_skeleton_workflow_parameters import workflow


def test_test_route_is_authenticated_closed_and_opening_never_runs(production,monkeypatch):
    import routes
    import route_skeleton_resources  # noqa: F401
    from flask import Flask
    from route_blueprint import api_blueprint
    store,_options,calls=production
    store.save_draft(workflow())
    app=Flask(__name__)
    app.register_blueprint(api_blueprint)
    client=app.test_client()
    monkeypatch.setattr(routes,'_is_authorized',lambda:False)
    assert client.post('/skeleton_tests/command',json={'schema':'pupu.builder-test.v1','op':'open','resource_id':'wf','kind':'workflow'}).status_code==401
    monkeypatch.setattr(routes,'_is_authorized',lambda:True)
    bad=client.post('/skeleton_tests/command',json={'schema':'pupu.builder-test.v1','op':'open','resource_id':'wf','kind':'workflow','options':{}})
    assert bad.status_code==400
    response=client.post('/skeleton_tests/command',json={'schema':'pupu.builder-test.v1','op':'open','resource_id':workflow()['id'],'kind':'workflow'})
    assert response.status_code==200
    assert response.json['runs']==[] and calls==[]
