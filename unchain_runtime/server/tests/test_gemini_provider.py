"""Gemini host routing; no credentials or live API required."""
import os
import re
import sys
from pathlib import Path
from unittest import mock

import pytest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import unchain_adapter as adapter


def test_gemini_model_selection_and_defaults():
    assert adapter._parse_model_overrides({'model': 'gemini:gemini-3.8-flash'}) == {'provider': 'gemini', 'model': 'gemini-3.8-flash'}
    assert adapter._provider_default_model('gemini') == 'gemini-3.6-flash'
    assert adapter._get_runtime_config({'provider':'gemini'})['provider'] == 'gemini'
    assert adapter._build_payload('gemini', {'maxTokens':2048})['max_output_tokens'] == 2048


@pytest.mark.parametrize('effort', ['low', 'medium', 'high'])
def test_gemini_thinking_settings_follow_selected_model(effort):
    options = {'modelId': 'gemini:gemini-3.6-flash', 'reasoningEffort': effort}
    assert adapter._build_payload('gemini', options)['thinking_config'] == {
        'thinking_level': effort, 'include_thoughts': True,
    }
    options['modelId'] = 'gemini:gemini-2.5-flash'
    legacy = adapter._build_payload('gemini', options)['thinking_config']
    assert legacy == {
        'thinking_budget': {'low': 1024, 'medium': 8192, 'high': 24576}[effort],
        'include_thoughts': True,
    }


def test_gemini_key_never_falls_back_to_another_provider():
    with mock.patch.dict(os.environ, {'OPENAI_API_KEY':'wrong-openai', 'ANTHROPIC_API_KEY':'wrong-anthropic'}, clear=True):
        with pytest.raises(RuntimeError): adapter._resolve_agent_api_key({},'gemini')
        assert adapter._extract_api_key_from_options({'anthropicApiKey':'wrong'},'gemini') == ''
        assert adapter._resolve_agent_api_key({'geminiApiKey':'gemini-key'},'gemini') == 'gemini-key'
    with mock.patch.dict(os.environ, {'GOOGLE_API_KEY':'google-key'},clear=True):
        assert adapter._resolve_agent_api_key({},'gemini') == 'google-key'


def test_gemini_catalog_from_runtime_resource():
    with mock.patch.object(adapter,'_fetch_ollama_models',return_value=[]):
        catalog=adapter.get_capability_catalog()
    assert {'gemini-3.6-flash','gemini-3.5-flash','gemini-3.1-pro-preview'} <= set(catalog['gemini'])
    # Google no longer serves the 2.5 line to new accounts (#386), so it is not offered.
    assert not [model for model in catalog['gemini'] if model.startswith('gemini-2.5')]


def test_recipe_model_list_only_offers_gemini_models_the_catalog_exports():
    # BC-386-3: the hardcoded recipe list must never invent a Gemini id.
    source = (Path(__file__).resolve().parents[3] / 'src/COMPONENTs/agents/pages/recipes_page/detail_panel/agent_panel.js').read_text()
    offered = set(re.findall(r'value:\s*"gemini:([^"]+)"', source))
    with mock.patch.object(adapter,'_fetch_ollama_models',return_value=[]):
        catalog = set(adapter.get_capability_catalog()['gemini'])
    assert offered
    assert offered <= catalog, sorted(offered - catalog)
