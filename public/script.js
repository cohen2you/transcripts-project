document.addEventListener('DOMContentLoaded', function() {
    const rawTranscript = document.getElementById('rawTranscript');
    const processBtn = document.getElementById('processBtn');
    const clearBtn = document.getElementById('clearBtn');
    const outputArea = document.getElementById('outputArea');
    const copyBtn = document.getElementById('copyBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const checkNamesBtn = document.getElementById('checkNamesBtn');
    const segmentBtn = document.getElementById('segmentBtn');
    const addDisclaimersBtn = document.getElementById('addDisclaimersBtn');
    const errorMsg = document.getElementById('errorMsg');
    const stats = document.getElementById('stats');
    const tokensUsed = document.getElementById('tokensUsed');

    let cleanedTranscriptText = '';
    let totalTokensUsed = 0;
    let hasDisclaimers = false;

    // Process transcript
    processBtn.addEventListener('click', async function() {
        const transcript = rawTranscript.value.trim();
        
        if (!transcript) {
            showError('Please paste a transcript first.');
            return;
        }

        // Show loading state
        processBtn.disabled = true;
        processBtn.querySelector('.btn-text').style.display = 'none';
        processBtn.querySelector('.btn-loader').style.display = 'inline-block';
        hideError();

        try {
            const response = await fetch('/api/process', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ transcript: transcript })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Processing failed');
            }

            // Display cleaned transcript
            cleanedTranscriptText = data.cleaned_transcript;
            // Use innerHTML to render HTML tags like <strong>
            outputArea.innerHTML = cleanedTranscriptText.replace(/\n/g, '<br>');
            
            // Show stats
            totalTokensUsed = data.tokens_used;
            tokensUsed.textContent = totalTokensUsed.toLocaleString();
            stats.style.display = 'block';
            
            // Show action buttons
            checkNamesBtn.style.display = 'inline-block';
            segmentBtn.style.display = 'inline-block';
            addDisclaimersBtn.style.display = 'inline-block';
            copyBtn.style.display = 'inline-block';
            downloadBtn.style.display = 'inline-block';

        } catch (error) {
            showError('Error: ' + error.message);
        } finally {
            // Reset button state
            processBtn.disabled = false;
            processBtn.querySelector('.btn-text').style.display = 'inline-block';
            processBtn.querySelector('.btn-loader').style.display = 'none';
        }
    });

    // Segment transcript
    segmentBtn.addEventListener('click', async function() {
        if (!cleanedTranscriptText) {
            showError('No transcript to segment.');
            return;
        }

        // Show loading state
        segmentBtn.disabled = true;
        segmentBtn.querySelector('.btn-text').style.display = 'none';
        segmentBtn.querySelector('.btn-loader').style.display = 'inline-block';
        hideError();

        try {
            const response = await fetch('/api/segment', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ transcript: cleanedTranscriptText })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Segmentation failed');
            }

            // Update with segmented transcript
            cleanedTranscriptText = data.segmented_transcript;
            outputArea.innerHTML = cleanedTranscriptText.replace(/\n/g, '<br>');
            
            // Update token count
            totalTokensUsed += data.tokens_used;
            tokensUsed.textContent = totalTokensUsed.toLocaleString();

            // Show success message briefly
            const originalText = segmentBtn.querySelector('.btn-text').textContent;
            segmentBtn.querySelector('.btn-text').textContent = '✓ Segmented!';
            setTimeout(() => {
                segmentBtn.querySelector('.btn-text').textContent = originalText;
            }, 3000);

        } catch (error) {
            showError('Error: ' + error.message);
        } finally {
            // Reset button state
            segmentBtn.disabled = false;
            segmentBtn.querySelector('.btn-text').style.display = 'inline-block';
            segmentBtn.querySelector('.btn-loader').style.display = 'none';
        }
    });

    // Add disclaimers
    addDisclaimersBtn.addEventListener('click', function() {
        if (!cleanedTranscriptText) {
            showError('No transcript to add disclaimers to.');
            return;
        }

        if (hasDisclaimers) {
            showError('Disclaimers already added.');
            return;
        }

        const topDisclaimer = `<div class="disclaimer">This transcript is brought to you by Benzinga APIs. For real-time access to our entire catalog, <a href="https://www.benzinga.com/apis/" target="_blank">please visit Benzinga APIs</a> for a consultation.</div>`;
        
        const bottomDisclaimer = `<div class="disclaimer">This transcript is to be used for informational purposes only. Though Benzinga believes the content to be substantially and directionally correct, Benzinga cannot and does not guarantee 100% accuracy of the content herein. Audio quality, accents, and technical issues could impact the exactness and we advise you to refer to source audio files before making any decisions based upon the above.</div>`;

        const transcriptWithDisclaimers = topDisclaimer + '<br>' + cleanedTranscriptText.replace(/\n/g, '<br>') + '<br>' + bottomDisclaimer;
        
        outputArea.innerHTML = transcriptWithDisclaimers;
        
        // Update the cleaned text to include disclaimers in HTML format for WordPress
        const topDisclaimerHTML = '<p><em>This transcript is brought to you by Benzinga APIs. For real-time access to our entire catalog, <a href="https://www.benzinga.com/apis/">please visit Benzinga APIs</a> for a consultation.</em></p>\n\n';
        const bottomDisclaimerHTML = '\n\n<p><em>This transcript is to be used for informational purposes only. Though Benzinga believes the content to be substantially and directionally correct, Benzinga cannot and does not guarantee 100% accuracy of the content herein. Audio quality, accents, and technical issues could impact the exactness and we advise you to refer to source audio files before making any decisions based upon the above.</em></p>';
        
        cleanedTranscriptText = topDisclaimerHTML + cleanedTranscriptText + bottomDisclaimerHTML;
        hasDisclaimers = true;

        // Change button text
        addDisclaimersBtn.textContent = '✓ Disclaimers Added';
        addDisclaimersBtn.disabled = true;
    });

    // Check name spelling
    checkNamesBtn.addEventListener('click', async function() {
        if (!cleanedTranscriptText) {
            showError('No transcript to check.');
            return;
        }

        // Show loading state
        checkNamesBtn.disabled = true;
        checkNamesBtn.querySelector('.btn-text').style.display = 'none';
        checkNamesBtn.querySelector('.btn-loader').style.display = 'inline-block';
        hideError();

        try {
            const response = await fetch('/api/check-names', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ transcript: cleanedTranscriptText })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Name checking failed');
            }

            // Update with corrected transcript
            cleanedTranscriptText = data.corrected_transcript;
            outputArea.innerHTML = cleanedTranscriptText.replace(/\n/g, '<br>');
            
            // Update token count
            totalTokensUsed += data.tokens_used;
            tokensUsed.textContent = totalTokensUsed.toLocaleString();

            // Show success message briefly
            const originalText = checkNamesBtn.querySelector('.btn-text').textContent;
            checkNamesBtn.querySelector('.btn-text').textContent = '✓ Names Verified!';
            setTimeout(() => {
                checkNamesBtn.querySelector('.btn-text').textContent = originalText;
            }, 3000);

        } catch (error) {
            showError('Error: ' + error.message);
        } finally {
            // Reset button state
            checkNamesBtn.disabled = false;
            checkNamesBtn.querySelector('.btn-text').style.display = 'inline-block';
            checkNamesBtn.querySelector('.btn-loader').style.display = 'none';
        }
    });

    // Clear all
    clearBtn.addEventListener('click', function() {
        rawTranscript.value = '';
        outputArea.innerHTML = '<p class="placeholder-text">Cleaned transcript will appear here...</p>';
        cleanedTranscriptText = '';
        totalTokensUsed = 0;
        hasDisclaimers = false;
        checkNamesBtn.style.display = 'none';
        segmentBtn.style.display = 'none';
        addDisclaimersBtn.style.display = 'none';
        addDisclaimersBtn.disabled = false;
        addDisclaimersBtn.textContent = 'Add Disclaimers';
        copyBtn.style.display = 'none';
        downloadBtn.style.display = 'none';
        stats.style.display = 'none';
        hideError();
    });

    // Copy to clipboard
    copyBtn.addEventListener('click', async function() {
        try {
            // If disclaimers are present, copy as HTML for WordPress compatibility
            if (hasDisclaimers) {
                // Convert newlines to <br> and wrap in paragraph tags for better WordPress formatting
                const htmlContent = cleanedTranscriptText
                    .replace(/\n\n/g, '</p><p>')
                    .replace(/\n/g, '<br>');
                
                const blob = new Blob([htmlContent], { type: 'text/html' });
                const clipboardItem = new ClipboardItem({ 'text/html': blob });
                await navigator.clipboard.write([clipboardItem]);
            } else {
                // Regular text copy
                await navigator.clipboard.writeText(cleanedTranscriptText);
            }
            
            const originalText = copyBtn.textContent;
            copyBtn.textContent = 'Copied!';
            setTimeout(() => {
                copyBtn.textContent = originalText;
            }, 2000);
        } catch (error) {
            // Fallback to plain text if HTML copy fails
            try {
                await navigator.clipboard.writeText(cleanedTranscriptText);
                const originalText = copyBtn.textContent;
                copyBtn.textContent = 'Copied!';
                setTimeout(() => {
                    copyBtn.textContent = originalText;
                }, 2000);
            } catch (fallbackError) {
                showError('Failed to copy to clipboard');
            }
        }
    });

    // Download as text file
    downloadBtn.addEventListener('click', function() {
        const blob = new Blob([cleanedTranscriptText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cleaned_transcript_${new Date().getTime()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

    function showError(message) {
        errorMsg.textContent = message;
        errorMsg.style.display = 'block';
    }

    function hideError() {
        errorMsg.style.display = 'none';
    }
});

