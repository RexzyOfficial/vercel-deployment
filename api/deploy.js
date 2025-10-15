// api/deploy.js - Vercel-compatible version
const VERCEL_TOKEN = process.env.VERCEL_TOKEN;

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { projectName, siteName } = req.body;

    if (!VERCEL_TOKEN) {
      return res.status(500).json({
        success: false,
        error: 'VERCEL_TOKEN environment variable is not set'
      });
    }

    if (!projectName) {
      return res.status(400).json({
        success: false,
        error: 'Project name is required'
      });
    }

    const cleanProjectName = projectName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 50);

    console.log(`🚀 Starting deployment for: ${cleanProjectName}`);

    // 1. Create or get project
    const project = await createOrGetProject(cleanProjectName);
    
    // 2. Create deployment
    const deployment = await createDeployment(project, siteName || cleanProjectName);
    
    // 3. Return URL immediately (no waiting for simplicity)
    const deployUrl = `https://${deployment.url}`;

    res.json({
      success: true,
      url: deployUrl,
      projectId: project.id,
      deploymentId: deployment.id,
      projectName: cleanProjectName,
      siteName: siteName || cleanProjectName
    });

  } catch (error) {
    console.error('❌ Deployment error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

async function createOrGetProject(projectName) {
  try {
    // Try to create project
    const createResponse = await fetch('https://api.vercel.com/v9/projects', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${VERCEL_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: projectName,
        framework: 'static'
      })
    });

    if (createResponse.ok) {
      return await createResponse.json();
    }

    // If project exists, get it
    if (createResponse.status === 409) {
      const getResponse = await fetch(`https://api.vercel.com/v9/projects/${projectName}`, {
        headers: {
          'Authorization': `Bearer ${VERCEL_TOKEN}`
        }
      });

      if (getResponse.ok) {
        return await getResponse.json();
      }
    }

    throw new Error(`Failed to create/get project: ${createResponse.status}`);

  } catch (error) {
    throw new Error(`Project creation failed: ${error.message}`);
  }
}

async function createDeployment(project, siteName) {
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <title>${siteName}</title>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            margin: 40px; 
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            text-align: center;
        }
        .container {
            background: rgba(255,255,255,0.1);
            padding: 40px;
            border-radius: 15px;
            backdrop-filter: blur(10px);
            max-width: 600px;
            margin: 0 auto;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 ${siteName}</h1>
        <p>Successfully deployed with Vercel Instant Deployer!</p>
        <p>Project: ${project.name}</p>
        <p>Deployment Date: ${new Date().toLocaleString('id-ID')}</p>
    </div>
</body>
</html>
  `;

  const deploymentPayload = {
    name: project.name,
    project: project.id,
    target: 'production',
    files: [
      {
        file: 'index.html',
        data: Buffer.from(htmlContent).toString('base64'),
        encoding: 'base64'
      }
    ],
    framework: 'static'
  };

  const deploymentResponse = await fetch('https://api.vercel.com/v13/deployments', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${VERCEL_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(deploymentPayload)
  });

  if (!deploymentResponse.ok) {
    const errorText = await deploymentResponse.text();
    throw new Error(`Deployment failed: ${errorText}`);
  }

  return await deploymentResponse.json();
                                              }
