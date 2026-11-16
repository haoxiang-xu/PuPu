import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ConfigContext } from '../../../../CONTAINERs/config/context';
import TitleBar, { TOP_BAR_HEIGHT } from '../../../../BUILTIN_COMPONENTs/electron/title_bar';
import SkeletonRunView from './skeleton_run_view';

jest.mock('./use_skeleton_run_observation', () => () => ({
  run: null, phase: 'empty', error: null, refreshing: false, refresh: jest.fn(),
}));
const originalRuntime = window.runtime;
const originalWindowState = window.windowStateAPI;
afterEach(() => {
  window.runtime = originalRuntime;
  window.windowStateAPI = originalWindowState;
});
function show(isDark = false) {
  const onClose = jest.fn();
  const view = render(<ConfigContext.Provider value={{ theme: {}, onThemeMode: isDark ? 'dark_mode' : 'light_mode', appMode: 'agents' }}>
    <TitleBar />
    <SkeletonRunView scope={{ owner_chat_id: 'test-chat', execution_id: 'test-chat', resource_id: 'test-workflow' }} isDark={isDark} onClose={onClose} />
  </ConfigContext.Provider>);
  const back = screen.getByRole('button', { name: 'Back' });
  return { ...view, back, toolbar: back.parentElement.parentElement, onClose };
}
test.each([false, true])('native run controls clear the actual titlebar band (dark=%s)', isDark => {
  window.runtime = { isElectron: true };
  window.windowStateAPI = { windowStateEventHandler: jest.fn(), windowStateEventListener: () => () => {} };
  const { back, toolbar, onClose } = show(isDark);
  expect(parseFloat(getComputedStyle(toolbar).marginTop)).toBeGreaterThanOrEqual(TOP_BAR_HEIGHT);
  fireEvent.click(back);
  expect(onClose).toHaveBeenCalledTimes(1);
});
test('web presentation keeps the original compact top spacing', () => {
  window.runtime = { isElectron: false };
  const { toolbar } = show();
  expect(parseFloat(getComputedStyle(toolbar).marginTop)).toBe(16);
});
test('an Electron marker without the window bridge creates no phantom titlebar gap', () => {
  window.runtime = { isElectron: true };
  window.windowStateAPI = undefined;
  const { toolbar } = show();
  expect(parseFloat(getComputedStyle(toolbar).marginTop)).toBe(16);
});
