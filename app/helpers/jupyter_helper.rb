module JupyterHelper

  # Given a name of a test - search the SEEK config setting for the relevant test spec (ipynb file name, display cells, etc)
  def get_notebook_spec_for_test(test)
    notebook_spec = Settings.defaults[:python_nb_notebooks].detect {|nb| nb["id"] == test }
    if notebook_spec.nil?
      Rails.logger.error "ERROR: test " + test + " not implemented."
      return
    end
    return notebook_spec
  end

  # Generate a temporary filename, return a KEY from the filename itself
  # Relies on the filename being foo-bla-KEY.suffix   (number of dashes doesn't matter as long as KEY is the last)
  def gen_temp_filename(n)
    arr = n.split(".")                        #seperate filename to prefix and suffix
    key = arr[0].split("-")[-1]               #get a key into the dictionaries (last word from the file name)

    # https://stackoverflow.com/questions/13787746/creating-a-thread-safe-temporary-file-name
    fname = Dir::Tmpname.make_tmpname([arr[0], "."+arr[1]], nil)
    return key, fname
  end

  # Given a list of file names, generates a temporary filename for each and returns a dictionary of filenames and dictionary of paths
  def create_temp_files(file_list, prefix_path)
    fnames = {}
    paths = {}
    for n in file_list
      key, name = gen_temp_filename(n)
      fnames[key] = name
      paths[key] =  prefix_path + "/" + name
    end
    return fnames, paths
  end

  # write a json object into a json file
  def write_from_json(json_to_write, json_obj)
    session.delete :extraction_exception_message
    begin
      outfile = File.new(json_to_write,"w")
      outfile.write(JSON.generate(json_obj))
      outfile.close()
    rescue Exception => e
      ExceptionNotifier.notify_exception(e, data: {
          message: "Jupyter notebooks: Error writing file from a JSON object:  #{json_to_write}",
          current_logged_in_user: current_user
      })
      session[:extraction_exception_message] = e.message
    end
  end

  def replace_placeholder_in_notebook_cell(json_notebook, cell, substitutions)
    json_notebook["cells"][cell]["source"].each_with_index do |line, i|
      substitutions.each do |key, value|
        line[key.to_s] = value
      end
      Rails.logger.info "Cell after Replace: " + json_notebook["cells"][cell]["source"][i].to_s
    end
    return json_notebook
  end

end