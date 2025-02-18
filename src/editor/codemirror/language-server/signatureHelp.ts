/**
 * Signature help. This shows a documentation tooltip when a user is
 * writing a function signature. Currently triggered by the opening
 * bracket.
 *
 * (c) 2021, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */
import { StateEffect, StateField } from "@codemirror/state";
import { showTooltip, Tooltip } from "@codemirror/tooltip";
import {
  EditorView,
  logException,
  PluginValue,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";
import { IntlShape } from "react-intl";
import {
  MarkupContent,
  SignatureHelp,
  SignatureHelpParams,
  SignatureHelpRequest,
} from "vscode-languageserver-protocol";
import { BaseLanguageServerView } from "./common";
import {
  wrapWithDocumentationButton,
  renderDocumentation,
} from "./documentation";
import { nameFromSignature, removeFullyQualifiedName } from "./names";
import { offsetToPosition } from "./positions";

interface SignatureChangeEffect {
  pos: number;
  result: SignatureHelp | null;
}

export const setSignatureHelpEffect = StateEffect.define<SignatureChangeEffect>(
  {}
);

interface SignatureHelpState {
  tooltip: Tooltip | null;
  result: SignatureHelp | null;
}

const signatureHelpToolTipBaseTheme = EditorView.baseTheme({
  ".cm-tooltip.cm-signature-tooltip": {
    padding: "3px 9px",
    width: "max-content",
    maxWidth: "500px",
  },
  ".cm-tooltip .cm-signature-activeParameter": {
    fontWeight: "bold",
  },
});

export const signatureHelp = (intl: IntlShape) => {
  const signatureHelpTooltipField = StateField.define<SignatureHelpState>({
    create: () => ({
      result: null,
      tooltip: null,
    }),
    update(state, tr) {
      for (const effect of tr.effects) {
        if (effect.is(setSignatureHelpEffect)) {
          return reduceSignatureHelpState(state, effect.value);
        }
      }
      return state;
    },
    provide: (f) => showTooltip.from(f, (val) => val.tooltip),
  });

  class SignatureHelpView
    extends BaseLanguageServerView
    implements PluginValue
  {
    constructor(view: EditorView, private intl: IntlShape) {
      super(view);
    }

    update({ docChanged, selectionSet, transactions }: ViewUpdate) {
      if (
        (docChanged || selectionSet) &&
        this.view.state.field(signatureHelpTooltipField).tooltip
      ) {
        this.triggerSignatureHelpRequest();
      } else if (docChanged) {
        const last = transactions[transactions.length - 1];

        // This needs to trigger for autocomplete adding function parens
        // as well as normal user input with `closebrackets` inserting
        // the closing bracket.
        if (last.isUserEvent("input")) {
          last.changes.iterChanges((_fromA, _toA, _fromB, _toB, inserted) => {
            if (inserted.sliceString(0).endsWith("()")) {
              this.triggerSignatureHelpRequest();
            }
          });
        }
      }
    }

    async triggerSignatureHelpRequest() {
      const pos = this.view.state.selection.main.from;
      const params: SignatureHelpParams = {
        textDocument: { uri: this.uri },
        position: offsetToPosition(this.view.state.doc, pos),
      };
      try {
        const result = await this.client.connection.sendRequest(
          SignatureHelpRequest.type,
          params
        );
        this.view.dispatch({
          effects: [setSignatureHelpEffect.of({ pos, result })],
        });
      } catch (e) {
        logException(this.view.state, e, "signature-help");
        this.view.dispatch({
          effects: [setSignatureHelpEffect.of({ pos, result: null })],
        });
      }
    }
  }

  const reduceSignatureHelpState = (
    state: SignatureHelpState,
    effect: SignatureChangeEffect
  ): SignatureHelpState => {
    if (state.tooltip && !effect.result) {
      return {
        result: null,
        tooltip: null,
      };
    }
    // It's a bit weird that we always update the position, but VS Code does this too.
    // I think ideally we'd have a notion of "same function call". Does the
    // node have a stable identity?
    if (effect.result) {
      const result = effect.result;
      return {
        result,
        tooltip: {
          pos: effect.pos,
          above: true,
          // This isn't great but the impact is really bad when it conflicts with autocomplete.
          // strictSide: true,
          create: () => {
            const dom = document.createElement("div");
            dom.className = "cm-signature-tooltip";
            dom.appendChild(formatSignatureHelp(result));
            return { dom };
          },
        },
      };
    }
    return state;
  };

  const formatSignatureHelp = (help: SignatureHelp): Node => {
    const { activeSignature: activeSignatureIndex, signatures } = help;
    // We intentionally do something minimal here to minimise distraction.
    const activeSignature =
      activeSignatureIndex === null
        ? signatures[0]
        : signatures[activeSignatureIndex!];
    const {
      label,
      parameters,
      activeParameter: activeParameterIndex,
    } = activeSignature;
    const activeParameter =
      activeParameterIndex !== undefined && parameters
        ? parameters[activeParameterIndex]
        : undefined;
    const activeParameterLabel = activeParameter?.label;
    const activeParameterDoc =
      activeParameter?.documentation || activeSignature.documentation;
    if (Array.isArray(activeParameterLabel)) {
      const [from, to] = activeParameterLabel;
      return formatHighlightedParameter(label, from, to, activeParameterDoc);
    } else if (typeof activeParameterLabel === "string") {
      throw new Error("Not supported");
    }
    return formatHighlightedParameter(
      label,
      label.length,
      label.length,
      activeParameterDoc
    );
  };

  const formatHighlightedParameter = (
    label: string,
    from: number,
    to: number,
    activeParameterDoc: string | MarkupContent | undefined
  ): Node => {
    let before = label.substring(0, from);
    const id = nameFromSignature(before);
    const parameter = label.substring(from, to);
    const after = label.substring(to);

    // Do this after using the indexes, not to the original label.
    before = removeFullyQualifiedName(before);

    const parent = document.createElement("div");
    parent.className = "docs-markdown";
    const code = parent.appendChild(document.createElement("code"));
    code.appendChild(document.createTextNode(before));
    const span = code.appendChild(document.createElement("span"));
    span.className = "cm-signature-activeParameter";
    span.appendChild(document.createTextNode(parameter));
    code.appendChild(document.createTextNode(after));

    const documentation = renderDocumentation(activeParameterDoc, true);
    parent.appendChild(documentation);

    return wrapWithDocumentationButton(intl, parent, id);
  };

  return [
    ViewPlugin.define((view) => new SignatureHelpView(view, intl)),
    signatureHelpTooltipField,
    signatureHelpToolTipBaseTheme,
  ];
};
