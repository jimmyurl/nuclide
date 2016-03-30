'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

import type {Outline, OutlineForUi, OutlineTree, OutlineTreeForUi} from '..';
import type {ProviderRegistry} from './ProviderRegistry';

import {Observable} from 'rx';
import invariant from 'assert';

import {event as commonsEvent} from '../../nuclide-commons';
const {observableFromSubscribeFunction} = commonsEvent;

import {getCursorPositions} from '../../nuclide-atom-helpers';

import {getLogger} from '../../nuclide-logging';
const logger = getLogger();

const TAB_SWITCH_DELAY = 200; // ms
export function createOutlines(providers: ProviderRegistry): Observable<OutlineForUi> {
  return getTextEditorEvents()
    .flatMap(async editor => {
      let outline: OutlineForUi;
      if (editor == null) {
        outline = {
          kind: 'not-text-editor',
        };
      } else {
        outline = await outlineForEditor(providers, editor);
      }
      return {editor, outline};
    })
    .flatMapLatest(({editor, outline}) => {
      if (outline.kind !== 'outline') {
        return Observable.just(outline);
      }
      return getCursorPositions(editor)
        .map(cursorLocation => {
          return highlightCurrentNode(outline, cursorLocation);
        });
    });
}

async function outlineForEditor(
  providers: ProviderRegistry,
  editor: atom$TextEditor
): Promise<OutlineForUi> {
  const scopeName = editor.getGrammar().scopeName;
  const readableGrammarName = editor.getGrammar().name;

  const outlineProvider = providers.findProvider(scopeName);
  if (outlineProvider == null) {
    return {
      kind: 'no-provider',
      grammar: readableGrammarName,
    };
  }
  let outline: ?Outline;
  try {
    outline = await outlineProvider.getOutline(editor);
  } catch (e) {
    logger.error('Error in outline provider:', e);
    outline = null;
  }
  if (outline == null) {
    return {
      kind: 'provider-no-outline',
    };
  }
  return {
    kind: 'outline',
    outlineTrees: outline.outlineTrees.map(treeToUiTree),
    editor,
  };
}

function treeToUiTree(outlineTree: OutlineTree): OutlineTreeForUi {
  return {
    tokenizedText: outlineTree.tokenizedText,
    startPosition: outlineTree.startPosition,
    endPosition: outlineTree.endPosition,
    highlighted: false,
    children: outlineTree.children.map(treeToUiTree),
  };
}

// Return an outline object with the node under the cursor highlighted. Does not mutate the
// original.
function highlightCurrentNode(outline: OutlineForUi, cursorLocation: atom$Point): OutlineForUi {
  invariant(outline.kind === 'outline');
  return {
    ...outline,
    outlineTrees: highlightCurrentNodeInTrees(outline.outlineTrees, cursorLocation),
  };
}

function highlightCurrentNodeInTrees(
  outlineTrees: Array<OutlineTreeForUi>,
  cursorLocation: atom$Point
): Array<OutlineTreeForUi> {
  return outlineTrees.map(tree => {
    return {
      ...tree,
      highlighted: shouldHighlightNode(tree, cursorLocation),
      children: highlightCurrentNodeInTrees(tree.children, cursorLocation),
    };
  });
}

function shouldHighlightNode(outlineTree: OutlineTreeForUi, cursorLocation: atom$Point): boolean {
  const startPosition = outlineTree.startPosition;
  const endPosition = outlineTree.endPosition;
  if (endPosition == null) {
    return false;
  }
  if (outlineTree.children.length !== 0) {
    // For now, only highlight leaf nodes.
    return false;
  }
  return cursorLocation.isGreaterThanOrEqual(startPosition) &&
   cursorLocation.isLessThanOrEqual(endPosition);
}

// Emits a TextEditor whenever the active editor changes or whenever the text in the active editor
// changes.
function getTextEditorEvents(): Observable<atom$TextEditor> {
  const textEvents = Observable.create(observer => {
    const textEventDispatcher =
      require('../../nuclide-text-event-dispatcher').getInstance();
    return textEventDispatcher.onAnyFileChange(editor => observer.onNext(editor));
  });

  const paneChanges = observableFromSubscribeFunction(
      atom.workspace.observeActivePaneItem.bind(atom.workspace),
    )
    // Delay the work on tab switch to keep tab switches snappy and avoid doing a bunch of
    // computation if there are a lot of consecutive tab switches.
    .debounce(TAB_SWITCH_DELAY);

  return Observable.merge(
    textEvents,
    paneChanges
      .map(() => atom.workspace.getActiveTextEditor())
  );
}
