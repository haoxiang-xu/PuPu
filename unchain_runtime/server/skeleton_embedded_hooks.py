"""Locate owned Hook bodies without resolving or publishing another resource."""


def embedded_hook_bodies(document, *, include_disabled=False):
    """Yield (relative document address, body) in stored occurrence order.

    Draft/source readers can encounter malformed containers. Execution readers
    call this only after actual Core admission; this is not a second validator.
    """
    nodes = document.get('nodes') if type(document) is dict else None
    for index, node in enumerate(nodes if type(nodes) is list else []):
        if (type(node) is not dict or node.get('type') != 'hooks_pool'
                or type(node.get('config')) is not dict):
            continue
        entries = node['config'].get('hooks')
        for at, hook in enumerate(entries if type(entries) is list else []):
            if type(hook) is not dict or (not include_disabled and hook.get('enabled') is False):
                continue
            source = hook.get('workflow')
            if type(source) is dict and source.get('kind') == 'embedded':
                yield ['nodes', index, 'config', 'hooks', at, 'workflow', 'document'], source.get('document')
