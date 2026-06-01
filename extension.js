const vscode = require("vscode");

/** @type {Map<string, string>} */
let originalCodeMap = new Map();

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  // 删除注释和空行
  let clear = vscode.commands.registerCommand("clear-code.clear", function () {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const doc = editor.document;
    const lang = doc.languageId;
    if (!["python", "cpp", "c"].includes(lang)) {
      vscode.window.showWarningMessage("仅支持 Python/C/C++ 文件");
      return;
    }

    const text = doc.getText();
    originalCodeMap.set(doc.uri.toString(), text);
    let cleaned = text;

    if (lang === "python") {
      cleaned = cleaned.replace(/""".*?"""/gs, "");
      cleaned = cleaned.replace(/'''.*?'''/gs, "");
      cleaned = cleaned.replace(/#.*/g, "");
    }

    if (["cpp", "c"].includes(lang)) {
      cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, "");
      cleaned = cleaned.replace(/\/\/.*/g, "");
    }

    // 删除空行/纯空格行
    cleaned = cleaned.replace(/^\s*[\r\n]/gm, "");

    editor.edit((edit) => {
      const start = new vscode.Position(0, 0);
      const end = new vscode.Position(
        doc.lineCount - 1,
        doc.lineAt(doc.lineCount - 1).text.length,
      );
      edit.replace(new vscode.Range(start, end), cleaned);
    });

    vscode.window.showInformationMessage("已删除注释和空行");
  });

  // 恢复原始代码
  let restore = vscode.commands.registerCommand(
    "clear-code.restore",
    function () {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const uri = editor.document.uri.toString();
      const original = originalCodeMap.get(uri);
      if (!original) {
        vscode.window.showWarningMessage("无备份可恢复");
        return;
      }

      editor.edit((edit) => {
        const start = new vscode.Position(0, 0);
        const end = new vscode.Position(
          editor.document.lineCount - 1,
          editor.document.lineAt(editor.document.lineCount - 1).text.length,
        );
        edit.replace(new vscode.Range(start, end), original);
      });

      vscode.window.showInformationMessage("已恢复原始代码");
    },
  );

  context.subscriptions.push(clear, restore);
}

function deactivate() {}

module.exports = { activate, deactivate };
