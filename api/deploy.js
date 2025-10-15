// Vercel Serverless Function - Real Vercel API Implementation
const DAWG_TOKEN = process.env.DAWG_TOKEN;

export default async function handler(req, res) {
  // Enable CORS
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
    console.log('🚀 Starting Vercel deployment process...');

    // Check Vercel Token
    if (!DAWG_TOKEN) {
      throw new Error('DAWG_TOKEN environment variable is not set. Please add your Vercel token in environment variables.');
    }

    // Get form data from request
    const contentType = req.headers['content-type'] || '';
    
    if (!contentType.includes('multipart/form-data')) {
      throw new Error('Content-Type must be multipart/form-data');
    }

    // In Vercel Functions, we need to parse multipart form data
    // For now, we'll use a simplified approach that works with Vercel's built-in parsing
    const { projectName, siteName } = req.body;
    const files = req.files || {};

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

    console.log(`📁 Processing project: ${cleanProjectName}`);

    // 1. Create or get project
    const project = await createOrGetProject(cleanProjectName);
    console.log(`✅ Project handled: ${project.name} (ID: ${project.id})`);

    // 2. Create deployment
    const deployment = await createDeployment(project, siteName || cleanProjectName);
    console.log(`📦 Deployment created: ${deployment.url}`);

    // 3. Wait for deployment to be ready
    const finalUrl = await waitForDeploymentReady(deployment.id, deployment.url);
    console.log(`🎉 Deployment ready: ${finalUrl}`);

    res.json({
      success: true,
      url: finalUrl,
      projectId: project.id,
      deploymentId: deployment.id,
      projectName: cleanProjectName,
      siteName: siteName || cleanProjectName
    });

  } catch (error) {
    console.error('❌ Deployment error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Unknown deployment error occurred'
    });
  }
}

// Create or get existing project
async function createOrGetProject(projectName) {
  try {
    // Try to create new project
    const createResponse = await fetch('https://api.vercel.com/v9/projects', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DAWG_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: projectName,
        framework: 'static',
        buildCommand: null,
        outputDirectory: null,
        installCommand: null
      })
    });

    if (createResponse.ok) {
      return await createResponse.json();
    }

    // If project already exists (409 Conflict), get the existing project
    if (createResponse.status === 409) {
      console.log(`📁 Project "${projectName}" already exists, retrieving...`);
      
      const getResponse = await fetch(`https://api.vercel.com/v9/projects/${projectName}`, {
        headers: {
          'Authorization': `Bearer ${DAWG_TOKEN}`
        }
      });

      if (getResponse.ok) {
        return await getResponse.json();
      }
    }

    const errorText = await createResponse.text();
    throw new Error(`Failed to create/get project: ${createResponse.status} - ${errorText}`);

  } catch (error) {
    throw new Error(`Project handling failed: ${error.message}`);
  }
}

// Create deployment
async function createDeployment(project, siteName) {
  try {
    // Create a simple HTML file for deployment
    const htmlContent = `
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${siteName}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            text-align: center;
            padding: 20px;
        }
        .container {
            background: rgba(255,255,255,0.1);
            backdrop-filter: blur(10px);
            padding: 50px;
            border-radius: 20px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            max-width: 600px;
        }
        h1 { 
            font-size: 3em; 
            margin-bottom: 20px;
            background: linear-gradient(135deg, #fff, #e2e8f0);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        p { 
            font-size: 1.3em; 
            margin-bottom: 15px;
            opacity: 0.9;
        }
        .deploy-info {
            background: rgba(255,255,255,0.2);
            padding: 20px;
            border-radius: 10px;
            margin-top: 30px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 ${siteName}</h1>
        <p>Selamat! Website Anda berhasil di-deploy!</p>
        <p>Dibuat dengan <strong>Vercel Instant Deployer</strong></p>
        
        <div class="deploy-info">
            <p><strong>Project:</strong> ${project.name}</p>
            <p><strong>Deployment Date:</strong> ${new Date().toLocaleString('id-ID')}</p>
            <p><strong>Status:</strong> ✅ Live & Ready</p>
        </div>
        
        <p style="margin-top: 30px; font-size: 1em; opacity: 0.7;">
            Upload file HTML, CSS, dan JS Anda melalui Vercel Instant Deployer untuk mengganti halaman ini.
        </p>
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
      framework: 'static',
      buildCommand: null,
      outputDirectory: null,
      installCommand: null
    };

    const deploymentResponse = await fetch('https://api.vercel.com/v13/deployments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DAWG_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(deploymentPayload)
    });

    if (!deploymentResponse.ok) {
      const errorText = await deploymentResponse.text();
      throw new Error(`Deployment creation failed: ${deploymentResponse.status} - ${errorText}`);
    }

    return await deploymentResponse.json();

  } catch (error) {
    throw new Error(`Deployment failed: ${error.message}`);
  }
}

// Wait for deployment to be ready
async function waitForDeploymentReady(deploymentId, deploymentUrl, maxAttempts = 30) {
  console.log('⏳ Waiting for deployment to be ready...');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const statusResponse = await fetch(`https://api.vercel.com/v13/deployments/${deploymentId}`, {
        headers: {
          'Authorization': `Bearer ${DAWG_TOKEN}`
        }
      });

      if (!statusResponse.ok) {
        console.log(`⚠️ Status check ${attempt}/${maxAttempts} failed: ${statusResponse.status}`);
        continue;
      }

      const deployment = await statusResponse.json();

      if (deployment.readyState === 'READY') {
        console.log(`✅ Deployment ready after ${attempt} checks`);
        return `https://${deployment.url}`;
      }

      if (deployment.readyState === 'ERROR') {
        throw new Error(`Deployment failed: ${deployment.errorMessage || 'Unknown error'}`);
      }

      if (deployment.readyState === 'CANCELED') {
        throw new Error('Deployment was canceled');
      }

      // Show progress
      const progress = Math.min((attempt / maxAttempts) * 100, 95);
      console.log(`📊 Deployment progress: ${progress.toFixed(0)}% (${attempt}/${maxAttempts})`);

      // Wait before next check
      await new Promise(resolve => setTimeout(resolve, 2000));

    } catch (error) {
      console.log(`⚠️ Status check ${attempt} error:`, error.message);
      
      if (attempt === maxAttempts) {
        // If timeout but we have a URL, return it anyway
        if (deploymentUrl) {
          console.log('🕒 Deployment timeout, but returning URL anyway');
          return `https://${deploymentUrl}`;
        }
        throw new Error(`Deployment timeout: ${error.message}`);
      }
    }
  }

  throw new Error('Deployment timeout: Maximum attempts reached');
                                             }
