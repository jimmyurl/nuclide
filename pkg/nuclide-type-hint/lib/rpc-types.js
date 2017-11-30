/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 *
 * @flow
 * @format
 */

export type TypeHint = {
  /**
   * A type hint string to display.
   */
  hint: Array<{type: 'snippet' | 'markdown', value: string}>,
  range: atom$Range,
};
