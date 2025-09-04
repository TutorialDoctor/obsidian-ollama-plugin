import { Notice, Plugin, MarkdownView, PluginSettingTab, Setting, App, EditorPosition } from 'obsidian';
import ollama from 'ollama/browser';

interface ModelSettings {
	model: string;
	systemPrompt: string;
}

const DEFAULT_SETTINGS: ModelSettings = {
	model: 'llama3.2',
	systemPrompt: '' // default empty
};

export default class OllamaPlugin extends Plugin {
	settings: ModelSettings;

	async onload() {
		await this.loadSettings();

		this.addRibbonIcon('message-circle', 'Send to Ollama', async () => {
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (!view || !view.editor) {
				new Notice("No active editor found.");
				return;
			}

			const editor = view.editor;
			const prompt = editor.getSelection();

			if (!prompt) {
				new Notice("Please select some text to send to Ollama.");
				return;
			}

			// Remember selection range
			const from = editor.getCursor("from");
			const to = editor.getCursor("to");

			// Insert placeholder
			editor.replaceRange("⏳ Generating response...", from, to);

			// Compute end of placeholder
			const lineLength = editor.getLine(from.line).length;
			const end: EditorPosition = { line: from.line, ch: lineLength };

			// Remove placeholder safely
			editor.replaceRange("", from, end);

			// Where to start inserting chunks
			let outputPos: EditorPosition = { ...from };

			// Build message
			const message = {
				role: 'user',
				content: this.settings.systemPrompt + "\n\n" + prompt
			};

			try {
				const response = await ollama.chat({
					model: this.settings.model,
					messages: [message],
					stream: true
				});

				// Append chunks progressively
				for await (const part of response) {
					const chunk = part.message.content;

					editor.replaceRange(chunk, outputPos);

					// Advance outputPos correctly
					const lines = chunk.split("\n");
					if (lines.length === 1) {
						outputPos.ch += lines[0].length;
					} else {
						outputPos.line += lines.length - 1;
						outputPos.ch = lines[lines.length - 1].length;
					}
				}
			} catch (err) {
				if(err.name ==='AbortError'){
					new Notice("Aborted all requests");
				}else {
				console.error(err);
				new Notice("❌ Error communicating with Ollama.");
				}
			}
		});

		this.addRibbonIcon('circle-stop', 'Stop Ollama', async () => {
			setTimeout(() => {
				console.log('\nAborting all requests...\n')
				ollama.abort()
			}, 100)
		});

		this.addSettingTab(new OllamaSettingTab(this.app, this));
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class OllamaSettingTab extends PluginSettingTab {
	plugin: OllamaPlugin;

	constructor(app: App, plugin: OllamaPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('AI Model')
			.setDesc('Model you want to use for prompting')
			.addText(text => text
				.setPlaceholder('Enter model name')
				.setValue(this.plugin.settings.model)
				.onChange(async (value) => {
					this.plugin.settings.model = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('System Prompt')
			.setDesc('Base instructions/personality for the AI')
			.addTextArea(text => text
				.setPlaceholder("This is the personality of the AI")
				.setValue(this.plugin.settings.systemPrompt)
				.onChange(async (value) => {
					this.plugin.settings.systemPrompt = value;
					await this.plugin.saveSettings();
				}));
	}
}

// This code was created by [The Tutorial Doctor](https://upskil.dev/)
