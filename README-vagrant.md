## development environment with vagrant

You can use the provided vagrant environment to develop in the project:
<pre>
git submodule update --init --recursive
cd vagrant
vagrant --extra-vars-file=../ansible_vars.yml --ansible-playbook=../ansible_site.yml --vmname=seek4science --cpus=2 --memory=4096 --nfs up
vagrant ssh
</pre>

If the provision process appears to be hanging (e.g. does not make progress) you can temrinate the process (Ctrl+C) and provision again:
<pre>
vagrant halt
vagrant --extra-vars-file=../ansible_vars.yml --ansible-playbook=../ansible_site.yml --vmname=seek4science --cpus=2 --memory=4096 --nfs up --provision
</pre>
This will restart the provisioning process - and ansible will take care of finishing unfinished steps.

<pre>
vagrant ssh
</pre>
You are in the virtual machine and you can find this project mounted in /project
You can start eclipse with
<pre>
cd /project # this is important to set the proper ruby version and GEM_HOME
~/sw/eclipse/4.5/eclipse/eclipse
</pre>

To shutdown (after logout) and resume use:
<pre>
vagrant halt
vagrant --vmname=seek4science --cpus=2 --memory=4096 --nfs up
</pre>

With every git pull, it might be necessary to update the submodule also; git status should show if it is necessary
also, since the roles might be installed from ansible-galaxy in new versions, the 'old' ones need to be removed
ansible-galaxy does not have a lock feature with versions yet
<pre>
git submodule update
rm -r -- vagrant/ansible/roles/*/
</pre>
