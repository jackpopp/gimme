/*
read package.json
read deps from dependencies
go to npm api to get its dep and build a graph
*/
import fs from 'fs';
import semver from 'semver';
import request from 'request-promise';
import download from 'download-file';
import tar from 'tar';

const DOWNLOAD_DIRECTORY = 'gimme_modules';
const downloadDirectory = `${process.cwd()}/${DOWNLOAD_DIRECTORY}`;
const REGISTRY = 'https://registry.npmjs.org';
const GRAPH = {};
const DEPENDENCY_LIST = {};

/**
 * Creates a node object and adds to the graph
 */
const addNode = (name, version, visitedRegistry = false) => {
    const key = `${name}@${version}`;

    if (GRAPH[key]) return GRAPH[key];

    const node = {
        key,
        name,
        version,
        dependents: {},
        visitedRegistry,
        downloadedTar: false
    };

    GRAPH[key] = node;

    if (DEPENDENCY_LIST[name]) {
        DEPENDENCY_LIST[name].push(version);
    } else {
        DEPENDENCY_LIST[name] = [version]
    }

    return node;
};

/**
 * Links two nodes, creates either of the nodes if they are missing
 */
const addVertex = (parentNode, childNode) => {
    parentNode.dependents[childNode.key] = childNode.key;
};

const loadPackage = () => {
    return JSON.parse(fs.readFileSync(`${process.cwd()}/package.json`));
}

const makeDownloadDirectory = (dir) => {
    if (!fs.existsSync(dir)){
        fs.mkdirSync(dir);
    }
}

const getCoercedVersion = (version) => {
    const coversedVersion = semver.coerce(version);

    if (coversedVersion === null) return version;

    return coversedVersion.version
}

const resolveVersionToInstallAtRoot = (versions, graph, rootPackage) => {
    Object.values(versions).forEach((version, name) => {
        console.log(`${Object.keys(versions)[name]} - ${version}`);
        if (version.length === 1) return version[0];

        console.log(version);
    });
    // is in the root then use that
    // are there multiples in the same range then just use a single one
}

const fetchDependencies = async (dep, installedVersion) => {
    console.info(`Fetching deps for - ${dep} - ${installedVersion}`);
    const coercedVersion = getCoercedVersion(installedVersion);

    const parentNode = addNode(dep, coercedVersion, true);

    const res = await request(`${REGISTRY}/${dep}`)
    const packageInformation = JSON.parse(res);
    const versions = packageInformation.versions;

    const matchedVersion = Object.keys(versions).find(version => {
        return semver.satisfies(version, coercedVersion)
    });

    const childDependencies = matchedVersion ? versions[matchedVersion].dependencies : null;

    if (childDependencies) {
        Object.keys(childDependencies).forEach((name) => {
            const version = childDependencies[name];
            const childNode = addNode(name, getCoercedVersion(version));
            addVertex(parentNode, childNode);
        });
    }

    if (versions[matchedVersion] && versions[matchedVersion].dist) {
        const tarUri = versions[matchedVersion].dist.tarball;
        parentNode.tarUri = tarUri;
    }

    for (let dep in childDependencies) {
        const installedVersion = childDependencies[dep];
        await fetchDependencies(dep, installedVersion);
    }

    /*download(tarUri, {
        directory: downloadDirectory,
        filename: `${dep}@${matchedVersion}`
    }, (err) => {
        if (err) console.error(err); 
    });*/

    //console.log(dep, matchedVersion, installedVersion);
}

const downloadTars = async (graph) => {
    const nodes = Object.values(graph);
    return new Promise(async (resolve, reject) => {
        for (let node of nodes) {
            await new Promise((resolve, reject) => {
                if (node.tarUri === undefined) {
                    return resolve('');
                }
                console.log(`Downloading tar - ${node.tarUri}`);
                download(node.tarUri, {
                    directory: downloadDirectory,
                    filename: node.key
                }, (err) => {
                    if (err) {
                        console.error(err)
                        return reject(err);
                    }
        
                    resolve('Done');
                });
            });
        }
        resolve('Done');
    });
}

const untar = async (graph) => {
    console.log('Untarring');
    const nodes = Object.values(graph);
    for (let node of nodes) {
        try {
            await tar.x({
                file: `${downloadDirectory}/${node.key}`,
                cwd: downloadDirectory
            });

            // move the file
            // remove the old
            fs.rename(`${downloadDirectory}/package`, `${downloadDirectory}/${node.name}`, (err) => {
                
                if (err) {
                    console.error(err);
                    return
                }

                fs.unlink(`${downloadDirectory}/${node.key}`, () => {
                    if (err) {
                        console.error(err);
                    }
                });
            });
        } catch (e) {
            console.error(e);
        }
    }
}

const run = async () => {
    const pkg = loadPackage();
    const { dependencies } = pkg;
    
    makeDownloadDirectory(downloadDirectory);

    for (let dep in dependencies) {
        const installedVersion = dependencies[dep];
        await fetchDependencies(dep, installedVersion);
    }
    console.log('start');
    resolveVersionToInstallAtRoot(DEPENDENCY_LIST, GRAPH, pkg);
    console.log('end');

   // console.log(DEPENDENCY_LIST);

    //await downloadTars(GRAPH);
    //untar(GRAPH);

    //console.log(GRAPH);
}

run();