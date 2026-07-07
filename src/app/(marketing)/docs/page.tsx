"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export default function DocsPage() {
  return (
    <div className="container mx-auto px-4 md:px-8 max-w-5xl py-12">
      <div className="mb-10 text-center md:text-left">
        <h1 className="text-4xl font-extrabold tracking-tight mb-4">API Documentation</h1>
        <p className="text-xl text-muted-foreground max-w-3xl">
          Everything you need to integrate Krypts DRM into your platform. Protect your content with just a few lines of code.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
        {/* Sidebar Nav */}
        <div className="hidden md:block col-span-1 border-r pr-4">
          <nav className="space-y-6 sticky top-24">
            <div>
              <h4 className="font-semibold mb-2">Getting Started</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#overview" className="text-primary font-medium hover:underline">Overview</a></li>
                <li><a href="#authentication" className="hover:text-foreground transition-colors">Authentication</a></li>
                <li><a href="#sdks" className="hover:text-foreground transition-colors">SDKs</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Content</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#upload" className="hover:text-foreground transition-colors">Upload &amp; Encrypt</a></li>
                <li><a href="#manage-files" className="hover:text-foreground transition-colors">Manage Files</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Access</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#issue-tokens" className="hover:text-foreground transition-colors">Issue Tokens</a></li>
                <li><a href="#revoke-tokens" className="hover:text-foreground transition-colors">Revoke Tokens</a></li>
              </ul>
            </div>
          </nav>
        </div>

        {/* Main Content */}
        <div className="col-span-1 md:col-span-3 space-y-12">
          
          <section id="overview">
            <h2 className="text-2xl font-bold mb-4">Overview</h2>
            <p className="text-muted-foreground mb-4 leading-relaxed">
              The Krypts backend provides a RESTful API for managing and securing your digital assets. 
              The general workflow is to upload your content, which is then automatically encrypted. 
              When a user wants to view the content, your backend requests an access token from Krypts, 
              which is passed to the client-side viewer.
            </p>
            <div className="bg-muted/50 border rounded-lg p-4 font-mono text-sm overflow-x-auto">
              https://api.krypts.com/v1
            </div>
          </section>

          <section id="authentication">
            <h2 className="text-2xl font-bold mb-4">Authentication</h2>
            <p className="text-muted-foreground mb-4">
              All API requests require a Bearer token in the Authorization header. You can generate API keys in the Dashboard.
            </p>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Request Headers</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-slate-950 text-slate-50 p-4 rounded-md overflow-x-auto font-mono text-sm">
                  <div><span className="text-blue-400">Authorization</span>: Bearer <span className="text-green-400">krypts_live_xxxxxxxxxxx</span></div>
                  <div><span className="text-blue-400">Content-Type</span>: application/json</div>
                </div>
              </CardContent>
            </Card>
          </section>

          <section id="integration">
            <h2 className="text-2xl font-bold mb-4">Example Integration (Generate Token)</h2>
            <p className="text-muted-foreground mb-4">
              When a user authenticates on your site, generate a Krypts token allowing them to view a specific encrypted file.
            </p>
            
            <Tabs defaultValue="nodejs" className="w-full">
              <TabsList className="w-full justify-start border-b rounded-none h-auto bg-transparent p-0 mb-6 space-x-6">
                <TabsTrigger 
                  value="nodejs" 
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-0 py-2"
                >
                  Node.js
                </TabsTrigger>
                <TabsTrigger 
                  value="python"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-0 py-2"
                >
                  Python
                </TabsTrigger>
                <TabsTrigger 
                  value="curl"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-0 py-2"
                >
                  cURL
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="nodejs" className="p-0 border-none">
                <div className="bg-[#0d1117] text-[#c9d1d9] rounded-lg p-5 font-mono text-sm overflow-x-auto relative">
                  <Badge variant="outline" className="text-xs absolute top-4 right-4 bg-muted/20 text-muted-foreground border-slate-700">TypeScript</Badge>
                  <pre><code>
{`import { Krypts } from '@krypts/sdk';

const krypts = new Krypts('krypts_live_YOUR_API_KEY');

export async function generateViewerToken(userId, fileId) {
  try {
    const tokenParams = {
      fileId: fileId,
      expiresIn: '2h',
      watermark: {
        text: \`User: \${userId}\`,
        opacity: 0.15
      },
      permissions: {
        allowDownload: false,
        allowPrint: false
      }
    };

    const response = await krypts.tokens.create(tokenParams);
    return response.token;
  } catch (error) {
    console.error('Failed to generate DRM token:', error);
  }
}`}
                  </code></pre>
                </div>
              </TabsContent>
              
              <TabsContent value="python" className="p-0 border-none">
                <div className="bg-[#0d1117] text-[#c9d1d9] rounded-lg p-5 font-mono text-sm overflow-x-auto relative">
                <Badge variant="outline" className="text-xs absolute top-4 right-4 bg-muted/20 text-muted-foreground border-slate-700">Python</Badge>
                  <pre><code>
{`import os
from krypts import KryptsClient

client = KryptsClient(api_key=os.environ.get("KRYPTS_API_KEY"))

def generate_viewer_token(user_id, file_id):
    try:
        response = client.tokens.create(
            file_id=file_id,
            expires_in="2h",
            watermark={
                "text": f"User: {user_id}",
                "opacity": 0.15
            },
            permissions={
                "allow_download": False,
                "allow_print": False
            }
        )
        return response.token
    except Exception as e:
        print(f"Failed to generate DRM token: {e}")
        return None`}
                  </code></pre>
                </div>
              </TabsContent>

              <TabsContent value="curl" className="p-0 border-none">
                <div className="bg-[#0d1117] text-[#c9d1d9] rounded-lg p-5 font-mono text-sm overflow-x-auto relative">
                  <Badge variant="outline" className="text-xs absolute top-4 right-4 bg-muted/20 text-muted-foreground border-slate-700">Bash</Badge>
                  <pre><code>
{`curl -X POST https://api.krypts.com/v1/tokens 
  -H "Authorization: Bearer krypts_live_YOUR_API_KEY" 
  -H "Content-Type: application/json" 
  -d '{
    "fileId": "file_8f7b...",
    "expiresIn": "2h",
    "watermark": { "text": "User: 12345", "opacity": 0.15 },
    "permissions": { "allowDownload": false, "allowPrint": false }
  }'`}
                  </code></pre>
                </div>
              </TabsContent>
            </Tabs>
          </section>

          <section id="responses">
            <h2 className="text-2xl font-bold mb-4">Response Object</h2>
            <div className="bg-[#0d1117] text-[#c9d1d9] rounded-lg p-5 font-mono text-sm overflow-x-auto relative">
              <Badge variant="outline" className="text-xs absolute top-4 right-4 bg-muted/20 text-muted-foreground border-slate-700">JSON</Badge>
              <pre><code>
{`{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJmaWxlSWQi...",
  "expiresAt": "2026-03-14T13:15:20Z",
  "id": "trk_9d8f7e6a"
}`}
              </code></pre>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Pass the returned <code className="bg-muted px-1.5 py-0.5 rounded text-foreground inline-block">token</code> to the Krypts Viewer component on your frontend to initialize the secure playback/rendering session.
            </p>
          </section>

          <section id="sdks">
            <h2 className="text-2xl font-bold mb-4">SDKs</h2>
            <p className="text-muted-foreground mb-4 leading-relaxed">
              Krypts provides official SDKs to make integration fast and type-safe. Install the one that matches your stack:
            </p>
            <div className="space-y-3">
              <div className="bg-[#0d1117] text-[#c9d1d9] rounded-lg p-4 font-mono text-sm">
                <span className="text-yellow-400"># Node.js / TypeScript</span>{"\n"}
                npm install @krypts/sdk
              </div>
              <div className="bg-[#0d1117] text-[#c9d1d9] rounded-lg p-4 font-mono text-sm">
                <span className="text-blue-400"># Python</span>{"\n"}
                pip install krypts
              </div>
              <div className="bg-[#0d1117] text-[#c9d1d9] rounded-lg p-4 font-mono text-sm">
                <span className="text-green-400"># REST API — no SDK needed</span>{"\n"}
                curl https://krypts-production.up.railway.app/docs
              </div>
            </div>
          </section>

          <section id="upload">
            <h2 className="text-2xl font-bold mb-4">Upload &amp; Encrypt</h2>
            <p className="text-muted-foreground mb-4 leading-relaxed">
              Upload content via a <code className="bg-muted px-1.5 py-0.5 rounded text-foreground">multipart/form-data</code> POST request. Krypts automatically encrypts the file at rest using AES-256 and returns a stable <code className="bg-muted px-1.5 py-0.5 rounded text-foreground">file_id</code>.
            </p>
            <div className="bg-[#0d1117] text-[#c9d1d9] rounded-lg p-5 font-mono text-sm overflow-x-auto relative">
              <Badge variant="outline" className="text-xs absolute top-4 right-4 bg-muted/20 text-muted-foreground border-slate-700">cURL</Badge>
              <pre><code>{`curl -X POST https://krypts-production.up.railway.app/api/files/upload \\
  -H "Authorization: Bearer <your_token>" \\
  -F "file=@/path/to/document.pdf"`}</code></pre>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">Supported formats: PDF, PNG, JPG, MP4, MOV and more.</p>
          </section>

          <section id="manage-files">
            <h2 className="text-2xl font-bold mb-4">Manage Files</h2>
            <p className="text-muted-foreground mb-4 leading-relaxed">
              List, inspect, and delete your protected files via the Content Manager API.
            </p>
            <div className="bg-[#0d1117] text-[#c9d1d9] rounded-lg p-5 font-mono text-sm overflow-x-auto relative">
              <Badge variant="outline" className="text-xs absolute top-4 right-4 bg-muted/20 text-muted-foreground border-slate-700">cURL</Badge>
              <pre><code>{`# List all files
curl https://krypts-production.up.railway.app/api/files \\
  -H "Authorization: Bearer <your_token>"

# Delete a file
curl -X DELETE https://krypts-production.up.railway.app/api/files/<file_id> \\
  -H "Authorization: Bearer <your_token>"`}</code></pre>
            </div>
          </section>

          <section id="issue-tokens">
            <h2 className="text-2xl font-bold mb-4">Issue Tokens</h2>
            <p className="text-muted-foreground mb-4 leading-relaxed">
              Generate a signed, time-limited JWT that grants a specific user access to a specific file. Pass this token to the Krypts viewer URL.
            </p>
            <div className="bg-[#0d1117] text-[#c9d1d9] rounded-lg p-5 font-mono text-sm overflow-x-auto relative">
              <Badge variant="outline" className="text-xs absolute top-4 right-4 bg-muted/20 text-muted-foreground border-slate-700">cURL</Badge>
              <pre><code>{`curl -X POST https://krypts-production.up.railway.app/api/tokens/generate \\
  -H "Authorization: Bearer <your_token>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "file_id": "your-file-uuid",
    "expires_in": "2h",
    "allow_download": false
  }'`}</code></pre>
            </div>
          </section>

          <section id="revoke-tokens">
            <h2 className="text-2xl font-bold mb-4">Revoke Tokens</h2>
            <p className="text-muted-foreground mb-4 leading-relaxed">
              Instantly invalidate any previously issued token. Once revoked, the viewer URL returns a <code className="bg-muted px-1.5 py-0.5 rounded text-foreground">401 Unauthorized</code> — useful for removing access when a subscription lapses or a user is banned.
            </p>
            <div className="bg-[#0d1117] text-[#c9d1d9] rounded-lg p-5 font-mono text-sm overflow-x-auto relative">
              <Badge variant="outline" className="text-xs absolute top-4 right-4 bg-muted/20 text-muted-foreground border-slate-700">cURL</Badge>
              <pre><code>{`curl -X DELETE https://krypts-production.up.railway.app/api/tokens/<token_id> \\
  -H "Authorization: Bearer <your_token>"`}</code></pre>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              The <code className="bg-muted px-1.5 py-0.5 rounded text-foreground">token_id</code> (<code className="bg-muted px-1.5 py-0.5 rounded text-foreground">id</code> field) is returned when you issue the token.
            </p>
          </section>

        </div>
      </div>
    </div>
  )
}
